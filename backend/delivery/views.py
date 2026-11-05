import math
import re

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import module_permission

from .calc import activity_days, find_cycle, reroute_links, schedule_totals
from .defaults import DEFAULT_SAFETY_FACTOR, PHASE_TOTAL_GROUP, default_activity_rows_with_links
from .models import DeliveryActivity, DeliveryScheduleSettings, DeliveryScheduleVersion, Sourcing

# Lead times are Sourcing's to maintain (Admin always allowed). Viewing needs "view" on
# Sourcing or Masters — every role holds Masters view under the default grids. Reset and
# restore rewrite the sheet, so they're an "edit", not a "create".
CanEditDeliverySchedule = module_permission("Sourcing", read_modules=("Sourcing", "Masters"), actions={"POST": "edit"})

# What a version snapshot (and a restore) carries for each row.
SNAPSHOT_FIELDS = (
    "code", "phase", "label", "sourcing", "std_days", "override_days", "unit", "notes", "total_group",
    "is_custom", "included", "depends_on",
)
CODE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,19}$")
NEW_CODE_RE = re.compile(r"^N(\d+)$")
SOURCING_OPTIONS = ", ".join(value for value, _ in Sourcing.choices)


class DaysField(serializers.FloatField):
    """A day count: a finite number, 0 or more (true/false and NaN aren't numbers here)."""

    default_error_messages = {"invalid": "must be a number.", "min_value": "can't be negative."}

    def __init__(self, **kwargs):
        super().__init__(min_value=0, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail("invalid")
        value = super().to_internal_value(data)
        if not math.isfinite(value):
            self.fail("invalid")
        return value


class ActivityInputSerializer(serializers.Serializer):
    """A workbook row only takes its input cells (sourcing, std/override days) and its
    critical-path links (included, depends_on) — its activity, phase, unit, notes, code and
    place in the total stay exactly as in the sheet. A row added on the page (no id yet,
    or is_custom) also takes the rest; a new row may bring its own code (so other rows
    can link to it in the same save), else it gets the next free N<number>."""

    id = serializers.IntegerField(required=False, allow_null=True)
    code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    sourcing = serializers.ChoiceField(
        choices=Sourcing.choices,
        error_messages={"invalid_choice": f'"{{input}}" is not a sourcing option — use {SOURCING_OPTIONS}.'},
    )
    std_days = DaysField()
    override_days = DaysField(required=False, allow_null=True)
    phase = serializers.CharField(max_length=120, required=False)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True)
    # Critical-path inputs. Left out = keep what's saved (older clients don't send them; an
    # added row starts In, no links).
    included = serializers.BooleanField(required=False)
    depends_on = serializers.ListField(child=serializers.CharField(max_length=20), required=False)


class ScheduleInputSerializer(serializers.Serializer):
    safety_factor = serializers.FloatField(error_messages={"invalid": "must be a number."})
    activities = ActivityInputSerializer(many=True)
    change_summary = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_safety_factor(self, value):
        if not math.isfinite(value) or value <= 0:
            raise serializers.ValidationError("must be greater than 0.")
        return value


FIELD_TITLES = {
    "safety_factor": "Safety factor", "activities": "Activities", "sourcing": "Sourcing", "std_days": "Std days",
    "override_days": "Override days", "code": "Code", "depends_on": "Depends on", "included": "Included",
    "label": "Activity", "phase": "Phase", "notes": "Notes", "id": "Row id", "change_summary": "Change summary",
}


def bad_request(messages: list[str]) -> ValidationError:
    """400 with every problem: {"detail": "all of them in one line", "errors": [...]}."""
    return ValidationError({"detail": " ".join(messages), "errors": messages})


def row_name(index: int, label: str | None) -> str:
    return f"Row {index + 1} ({label})" if label else f"Row {index + 1}"


def _leaves(errors) -> list[str]:
    if isinstance(errors, dict):
        return [m for v in errors.values() for m in _leaves(v)]
    if isinstance(errors, list):
        return [m for v in errors for m in _leaves(v)]
    return [str(errors)]


def serializer_messages(errors: dict, raw_rows: list, labels_by_id: dict[int, str]) -> list[str]:
    """DRF's nested errors as plain sentences: "Row 3 (Weld Preparation) – Std days: can't be negative." """
    messages = []
    for field, errs in errors.items():
        title = FIELD_TITLES.get(field, field)
        # Per-row errors: a list (one entry per row) or, in newer DRF, {row index: errors}.
        per_row = enumerate(errs) if isinstance(errs, list) else errs.items() if isinstance(errs, dict) else []
        per_row = [(i, e) for i, e in per_row if isinstance(i, int)]
        if field == "activities" and per_row:
            for i, row_errs in per_row:
                raw = raw_rows[i] if i < len(raw_rows) and isinstance(raw_rows[i], dict) else {}
                name = row_name(i, raw.get("label") or labels_by_id.get(raw.get("id")))
                for row_field, msgs in (row_errs or {}).items():
                    messages += [f"{name} – {FIELD_TITLES.get(row_field, row_field)}: {m}" for m in _leaves(msgs)]
        else:
            messages += [f"{title}: {m}" for m in _leaves(errs)]
    return messages


def activity_dict(a: DeliveryActivity) -> dict:
    return {f: getattr(a, f) for f in SNAPSHOT_FIELDS}


def sheet_snapshot() -> dict:
    return {
        "safety_factor": DeliveryScheduleSettings.load().safety_factor,
        "activities": [activity_dict(a) for a in DeliveryActivity.objects.all()],
    }


def computed_sheet(activities: list[dict], safety_factor: float) -> dict:
    """Rows with their days and critical-path timings, plus the totals."""
    rows = [{**a, "days": activity_days(a["sourcing"], a["std_days"], a["override_days"])} for a in activities]
    totals = schedule_totals(rows, safety_factor)
    timings = totals.pop("timings")
    for r in rows:
        r.update(timings[r["code"]])
    return {"safety_factor": safety_factor, "activities": rows, **totals}


def version_summary(v: DeliveryScheduleVersion) -> dict:
    return {
        "id": v.id, "number": v.number, "version_label": v.version_label,
        "saved_by": (v.saved_by.get_full_name() or v.saved_by.username) if v.saved_by else None,
        "saved_by_id": v.saved_by_id, "saved_at": v.saved_at, "change_summary": v.change_summary,
        "total_days": v.total_days, "delivery_weeks": v.delivery_weeks, "critical_codes": v.critical_codes,
    }


def schedule_payload() -> dict:
    settings = DeliveryScheduleSettings.load()
    activities = [{"id": a.id, **activity_dict(a)} for a in DeliveryActivity.objects.all()]
    latest = DeliveryScheduleVersion.objects.select_related("saved_by").first()
    return {**computed_sheet(activities, settings.safety_factor), "current_version": version_summary(latest) if latest else None}


def describe_changes(before: dict, after: dict) -> str:
    """The automatic change summary when the save doesn't bring one."""
    old = {a["code"]: a for a in before["activities"]}
    new = {a["code"]: a for a in after["activities"]}
    parts = []
    if added := [f"{c} ({new[c]['label']})" for c in new if c not in old]:
        parts.append("Added " + ", ".join(added))
    if removed := [f"{c} ({old[c]['label']})" for c in old if c not in new]:
        parts.append("Removed " + ", ".join(removed))
    if changed := [c for c in new if c in old and new[c] != old[c]]:
        parts.append("Changed " + ", ".join(changed))
    if before["safety_factor"] != after["safety_factor"]:
        parts.append(f"Safety factor {before['safety_factor']:g} → {after['safety_factor']:g}")
    return "; ".join(parts) or "Saved with no changes"


def save_version(user, change_summary: str) -> DeliveryScheduleVersion:
    """Record the live sheet as the next version (call inside the save's transaction)."""
    snapshot = sheet_snapshot()
    sheet = computed_sheet(snapshot["activities"], snapshot["safety_factor"])
    number = (DeliveryScheduleVersion.objects.order_by("-number").values_list("number", flat=True).first() or 0) + 1
    return DeliveryScheduleVersion.objects.create(
        number=number, version_label=f"v{number}", saved_by=user if user.is_authenticated else None,
        change_summary=change_summary[:500], snapshot=snapshot, total_days=sheet["total_days"],
        delivery_weeks=sheet["delivery_weeks"], critical_codes=sheet["critical_codes"],
    )


def load_sheet(activities: list[dict], safety_factor: float) -> None:
    """Replace the live sheet (reset / restore) — rows in the given order."""
    DeliveryActivity.objects.all().delete()
    DeliveryActivity.objects.bulk_create(
        DeliveryActivity(**{f: row[f] for f in SNAPSHOT_FIELDS if f in row}, order=i) for i, row in enumerate(activities)
    )
    settings = DeliveryScheduleSettings.load()
    settings.safety_factor = safety_factor
    settings.save()


class DeliveryScheduleView(APIView):
    """
    GET /api/delivery-schedule/       — every row with its days and critical-path timings,
                                        plus the totals
    PUT/PATCH /api/delivery-schedule/ — save the sheet ("edit" on Sourcing): {safety_factor,
                                        activities: [...], change_summary?} in display order.
                                        A workbook row only saves its input cells and links;
                                        a row without an id is added to its phase; any row
                                        left out is deleted (links to it go to its own
                                        predecessors). Every save is recorded as a version.
    """

    permission_classes = [CanEditDeliverySchedule]

    def get(self, request):
        return Response(schedule_payload())

    def put(self, request):
        existing = {a.id: a for a in DeliveryActivity.objects.all()}
        req = ScheduleInputSerializer(data=request.data)
        if not req.is_valid():
            raw_rows = request.data.get("activities") if isinstance(request.data, dict) else None
            labels = {a.id: a.label for a in existing.values()}
            raise bad_request(serializer_messages(req.errors, raw_rows if isinstance(raw_rows, list) else [], labels))
        data = req.validated_data
        sent_ids = [r["id"] for r in data["activities"] if r.get("id")]
        if len(sent_ids) != len(set(sent_ids)) or any(i not in existing for i in sent_ids):
            raise bad_request(["The sheet was changed by someone else — reload the page and try again."])

        problems = []
        plan = []  # (activity, name, depends_on) in display order
        for order, row in enumerate(data["activities"]):
            activity = existing.get(row.get("id")) or DeliveryActivity(is_custom=True)
            name = row_name(order, activity.label or (row.get("label") or "").strip())
            activity.sourcing = row["sourcing"]
            activity.std_days = row["std_days"]
            activity.override_days = row.get("override_days")
            if activity.is_custom:
                # An added row already saved keeps its name/phase/notes when they aren't sent.
                label = (row["label"] if "label" in row else activity.label or "").strip()
                phase = row["phase"] if "phase" in row else activity.phase
                if not label:
                    problems.append(f"Row {order + 1}: give the new activity a name.")
                # The workbook's phases — fixed, so still offered after all of one's rows are deleted.
                elif phase not in PHASE_TOTAL_GROUP:
                    problems.append(f"'{label}': pick one of the sheet's phases.")
                else:
                    activity.label = label
                    activity.phase = phase
                    activity.notes = row["notes"] if "notes" in row else activity.notes
                    activity.total_group = PHASE_TOTAL_GROUP[phase]
            if activity.pk is None:
                activity.code = (row.get("code") or "").strip()
                if activity.code and not CODE_RE.match(activity.code):
                    problems.append(f"{name}: code '{activity.code}' must start with a letter and use only letters, digits, - or _.")
            if "included" in row:
                activity.included = row["included"]
            activity.order = order
            deps = row["depends_on"] if "depends_on" in row else activity.depends_on
            plan.append((activity, name, [d.strip() for d in deps if d.strip()]))

        # Codes: no two rows share one; rows still without one get the next free N<number>.
        by_code: dict[str, list[str]] = {}
        for activity, name, _ in plan:
            if activity.code:
                by_code.setdefault(activity.code, []).append(name)
        for code, names in by_code.items():
            if len(names) > 1:
                problems.append(f"Code '{code}' is used by more than one row: {', '.join(names)}.")
        next_n = max((int(m.group(1)) for c in by_code if (m := NEW_CODE_RE.match(c))), default=0)
        for activity, _, _ in plan:
            if not activity.code:
                next_n += 1
                activity.code = f"N{next_n}"

        # Links: never to itself; a deleted row's links pass on to its successors; links
        # to codes that don't exist are dropped; no circles.
        kept = {activity.code for activity, _, _ in plan}
        removed = {a.code: a.depends_on for a in existing.values() if a.id not in set(sent_ids)}
        for activity, name, deps in plan:
            if activity.code in deps:
                problems.append(f"{name} can't depend on itself ({activity.code}).")
            activity.depends_on = [d for d in reroute_links(deps, kept, removed) if d != activity.code]
        if not problems and (cycle := find_cycle({a.code: a.depends_on for a, _, _ in plan})):
            problems.append(f"Circular dependency: {' → '.join(cycle)}. Remove one of these links.")
        if problems:
            raise bad_request(problems)

        before = sheet_snapshot()
        with transaction.atomic():
            for activity, _, _ in plan:
                activity.save()
            # Any row left out was deleted on the page ("Reset" brings workbook rows back).
            DeliveryActivity.objects.exclude(id__in=[a.id for a, _, _ in plan]).delete()
            settings = DeliveryScheduleSettings.load()
            settings.safety_factor = data["safety_factor"]
            settings.save()
            summary = (data.get("change_summary") or "").strip() or describe_changes(before, sheet_snapshot())
            save_version(request.user, summary)
        return Response(schedule_payload())

    # The frontend's apiClient has patch() but no put() — same whole-sheet save.
    patch = put


class DeliveryScheduleResetView(APIView):
    """POST /api/delivery-schedule/reset/ — back to the client workbook's rows, links and 1.2 factor."""

    permission_classes = [CanEditDeliverySchedule]

    def post(self, request):
        with transaction.atomic():
            load_sheet(default_activity_rows_with_links(), DEFAULT_SAFETY_FACTOR)
            save_version(request.user, "Reset to workbook defaults")
        return Response(schedule_payload())


class DeliveryScheduleVersionListView(APIView):
    """GET /api/delivery-schedule/versions/ — every saved version, newest first (no rows)."""

    permission_classes = [CanEditDeliverySchedule]

    def get(self, request):
        return Response([version_summary(v) for v in DeliveryScheduleVersion.objects.select_related("saved_by")])


class DeliveryScheduleVersionDetailView(APIView):
    """GET /api/delivery-schedule/versions/<id>/ — one version with its rows, computed as
    the live sheet is (days, es/ef/ls/lf, float, critical)."""

    permission_classes = [CanEditDeliverySchedule]

    def get(self, request, pk):
        version = get_object_or_404(DeliveryScheduleVersion.objects.select_related("saved_by"), pk=pk)
        sheet = computed_sheet(version.snapshot["activities"], version.snapshot["safety_factor"])
        return Response({**version_summary(version), "safety_factor": sheet["safety_factor"], "activities": sheet["activities"]})


class DeliveryScheduleVersionRestoreView(APIView):
    """POST /api/delivery-schedule/versions/<id>/restore/ — load a version back into the
    live sheet ("edit" on Sourcing); recorded as a new version. Returns the live sheet."""

    permission_classes = [CanEditDeliverySchedule]

    def post(self, request, pk):
        version = get_object_or_404(DeliveryScheduleVersion, pk=pk)
        with transaction.atomic():
            load_sheet(version.snapshot["activities"], version.snapshot["safety_factor"])
            save_version(request.user, f"Restored {version.version_label}")
        return Response(schedule_payload())
