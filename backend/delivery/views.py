from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from accounts.permissions import role_write_permission

from .calc import activity_days, schedule_totals
from .defaults import DEFAULT_SAFETY_FACTOR, PHASE_TOTAL_GROUP, default_activity_rows
from .models import DeliveryActivity, DeliveryScheduleSettings, Sourcing

# Lead times are Sourcing's to maintain (Admin always allowed); everyone can view.
CanEditDeliverySchedule = role_write_permission((Role.SOURCING,))


class ActivityInputSerializer(serializers.Serializer):
    """A workbook row only takes its input cells (sourcing, std/override days) — its
    activity, phase, unit, notes and place in the total stay exactly as in the sheet.
    A row added on the page (no id yet, or is_custom) also takes the rest."""

    id = serializers.IntegerField(required=False, allow_null=True)
    sourcing = serializers.ChoiceField(choices=Sourcing.choices)
    std_days = serializers.FloatField(min_value=0)
    override_days = serializers.FloatField(min_value=0, required=False, allow_null=True)
    phase = serializers.CharField(max_length=120, required=False)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class ScheduleInputSerializer(serializers.Serializer):
    safety_factor = serializers.FloatField(min_value=0)
    activities = ActivityInputSerializer(many=True)


def schedule_payload() -> dict:
    settings = DeliveryScheduleSettings.load()
    rows = [
        {
            "id": a.id, "phase": a.phase, "label": a.label, "sourcing": a.sourcing, "std_days": a.std_days,
            "override_days": a.override_days, "unit": a.unit, "notes": a.notes, "total_group": a.total_group,
            "is_custom": a.is_custom, "days": activity_days(a.sourcing, a.std_days, a.override_days),
        }
        for a in DeliveryActivity.objects.all()
    ]
    return {"safety_factor": settings.safety_factor, "activities": rows, **schedule_totals(rows, settings.safety_factor)}


class DeliveryScheduleView(APIView):
    """
    GET /api/delivery-schedule/       — every row with its computed days, plus the totals
    PUT/PATCH /api/delivery-schedule/ — save the sheet (Sourcing/Admin): {safety_factor,
                                        activities: [...]} in display order. A workbook row
                                        only saves its input cells; a row without an id is
                                        added to its phase; any row left out is deleted.
    """

    permission_classes = [CanEditDeliverySchedule]

    def get(self, request):
        return Response(schedule_payload())

    def put(self, request):
        req = ScheduleInputSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        data = req.validated_data
        existing = {a.id: a for a in DeliveryActivity.objects.all()}
        sent_ids = [r["id"] for r in data["activities"] if r.get("id")]
        if len(sent_ids) != len(set(sent_ids)) or any(i not in existing for i in sent_ids):
            raise ValidationError({"detail": "The sheet was changed by someone else — reload the page and try again."})

        with transaction.atomic():
            kept = set()
            for order, row in enumerate(data["activities"]):
                activity = existing.get(row.get("id")) or DeliveryActivity(is_custom=True)
                activity.sourcing = row["sourcing"]
                activity.std_days = row["std_days"]
                activity.override_days = row.get("override_days")
                if activity.is_custom:
                    label = (row.get("label") or "").strip()
                    if not label:
                        raise ValidationError({"detail": f"Row {order + 1}: give the new activity a name."})
                    # The workbook's phases — fixed, so still offered after all of one's rows are deleted.
                    if row.get("phase") not in PHASE_TOTAL_GROUP:
                        raise ValidationError({"detail": f"'{label}': pick one of the sheet's phases."})
                    activity.label = label
                    activity.phase = row["phase"]
                    activity.notes = row.get("notes", "")
                    activity.total_group = PHASE_TOTAL_GROUP[row["phase"]]
                activity.order = order
                activity.save()
                kept.add(activity.id)
            # Any row left out was deleted on the page ("Reset" brings workbook rows back).
            DeliveryActivity.objects.exclude(id__in=kept).delete()
            settings = DeliveryScheduleSettings.load()
            settings.safety_factor = data["safety_factor"]
            settings.save()
        return Response(schedule_payload())

    # The frontend's apiClient has patch() but no put() — same whole-sheet save.
    patch = put


class DeliveryScheduleResetView(APIView):
    """POST /api/delivery-schedule/reset/ — back to the client workbook's rows and 1.2 factor."""

    permission_classes = [CanEditDeliverySchedule]

    def post(self, request):
        with transaction.atomic():
            DeliveryActivity.objects.all().delete()
            DeliveryActivity.objects.bulk_create(DeliveryActivity(**row) for row in default_activity_rows())
            settings = DeliveryScheduleSettings.load()
            settings.safety_factor = DEFAULT_SAFETY_FACTOR
            settings.save()
        return Response(schedule_payload())
