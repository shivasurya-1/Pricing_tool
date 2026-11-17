"""Sourcing-stage outsourced processing costs for a pulley (RFQItem).

Two things Sourcing can set on the Sourcing screen's "In-House / Outsource Processes"
table, both only for OUTSOURCED processes (in-house cost editing comes later):

* ``process_costs`` — a manual per-unit cost for one of the standard processes
  (``processKey`` = the technical-data sourcing key, e.g. ``srcStressRelief``). Only
  allowed while that process is set to "Outsource" on the item. The frontend uses it
  in place of the formula value of that process's Section D line.
* ``custom_processes`` — extra outsourced processes added by hand (label, per-unit
  cost, optional vendor). The frontend adds each one as an extra Section D line.

* ``outsourced_field_costs`` — a per-unit cost for any field the Formulas page has under
  "Pricing Section D — Outsourced Processing" ({fieldKey: cost}). This is what the
  Sourcing screen edits today: the frontend uses it in place of that field's formula
  on the Pricing Tool page, so the D total and Section F follow.

All feed "Outsourced processing cost (D)" on the Pricing Tool page.
"""

import re
import uuid

from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import RFQItem
from .workflow import WorkflowError, require_can_act, require_stage

OUTSOURCE = "Outsource"
MAX_LABEL_LENGTH = 120


def _parse_cost(value, field_name: str = "cost") -> float:
    if isinstance(value, bool):
        raise ValidationError({field_name: "Must be a number."})
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValidationError({field_name: "Must be a number."})
    if number != number or number in (float("inf"), float("-inf")):
        raise ValidationError({field_name: "Must be a finite number."})
    if number < 0:
        raise ValidationError({field_name: "Cannot be negative."})
    return number


MODES = ("In-house", OUTSOURCE, "Logistics")
# An added row's In-House Hours inputs (see _update_custom_process).
HOUR_KEYS = ("mhrRate", "runMin", "setupMin")


def _parse_mode(value) -> str:
    mode = str(value or "").strip()
    if mode not in MODES:
        raise ValidationError({"mode": f"Must be one of: {', '.join(MODES)}."})
    return mode


def _parse_label(value) -> str:
    label = str(value or "").strip()
    if not label:
        raise ValidationError({"label": "Process name is required."})
    if len(label) > MAX_LABEL_LENGTH:
        raise ValidationError({"label": f"At most {MAX_LABEL_LENGTH} characters."})
    return label


SOURCING_SECTION_RE = re.compile(r"^\s*Pricing Section ([CD])\b", re.IGNORECASE)
TOTAL_LABEL_RE = re.compile(r"^\s*total\b", re.IGNORECASE)
# A field's mode when none is stored: Section C fields are In-house, Section D Outsource.
DEFAULT_MODE = {"C": "In-house", "D": OUTSOURCE}


def _sourcing_field(field_key: str):
    """The Formulas page's Pricing Section C or D field `field_key` (not a total row), or 400.
    Returns (field, section letter)."""
    from formulas.models import TechDataFieldDefinition

    field = TechDataFieldDefinition.objects.filter(key=field_key).first() if field_key else None
    match = SOURCING_SECTION_RE.match(field.section or "") if field else None
    if match is None:
        raise ValidationError({"fieldKey": f"'{field_key}' is not a Pricing Section C or D field."})
    if TOTAL_LABEL_RE.match(field.label or ""):
        raise ValidationError({"fieldKey": "A total row is calculated, it can't be set directly."})
    return field, match.group(1).upper()


def _vendor_fields(data, current: dict | None = None) -> dict:
    """vendorId/vendorName pair — both optional; an empty vendorId clears the vendor."""
    current = current or {}
    if "vendorId" not in data and "vendorName" not in data:
        return {"vendorId": current.get("vendorId", ""), "vendorName": current.get("vendorName", "")}
    vendor_id = str(data.get("vendorId") or "").strip()
    return {"vendorId": vendor_id, "vendorName": str(data.get("vendorName") or "").strip() if vendor_id else ""}


class SourcingCostsMixin:
    """Mixed into RFQViewSet (needs its get_object/_actor/_fresh/_handle_workflow_error)."""

    def _sourcing_item(self, request, item_id=None):
        rfq = self.get_object()
        actor_name, _role = self._actor(request)
        try:
            require_stage(rfq, "Sourcing")
            require_can_act(request.user, "Sourcing")
        except WorkflowError as exc:
            self._handle_workflow_error(exc)
        item_id = item_id if item_id is not None else request.data.get("itemId")
        item = get_object_or_404(RFQItem, pk=item_id, rfq=rfq)
        return rfq, item, actor_name or request.query_params.get("actorName", "")

    def _save_and_respond(self, request, rfq, item, field: str, actor_name: str, action_text: str):
        # Imported here: views.py imports this module to build RFQViewSet.
        from .views import append_audit, touch

        item.save(update_fields=[field])
        touch(rfq)
        append_audit(
            rfq, user=actor_name, role=request.user.role, module="Sourcing", record=rfq.rfq_number,
            action_text=f"Pulley #{item.item_no}: {action_text}",
        )
        return Response(self._fresh(rfq))

    # ---- manual cost for a standard outsourced process ----------------------------
    @action(detail=True, methods=["patch"], url_path="item-process-cost")
    def set_process_cost(self, request, pk=None):
        """Body: {itemId, processKey, cost} — cost null/"" clears the manual cost."""
        rfq, item, actor_name = self._sourcing_item(request)
        process_key = str(request.data.get("processKey") or "").strip()
        if not process_key:
            raise ValidationError({"processKey": "Required."})
        raw_cost = request.data.get("cost")
        clearing = raw_cost is None or raw_cost == ""
        others = [p for p in (item.process_costs or []) if p.get("processKey") != process_key]

        if clearing:
            item.process_costs = others
            text = f"cleared manual outsourced cost for {process_key}"
        else:
            if (item.technical_data or {}).get(process_key) != OUTSOURCE:
                raise ValidationError({"processKey": f"'{process_key}' is not set to Outsource on this pulley."})
            cost = _parse_cost(raw_cost)
            item.process_costs = others + [{"processKey": process_key, "cost": cost}]
            text = f"set outsourced cost for {process_key} to {cost:g}"
        return self._save_and_respond(request, rfq, item, "process_costs", actor_name, text)

    # ---- cost / mode for a Formulas-page "Pricing Section C / D" field ---------------
    # (endpoint and field names say "outsourced" because they started with Section D only)
    @action(detail=True, methods=["patch"], url_path="item-outsourced-field-cost")
    def set_outsourced_field_cost(self, request, pk=None):
        """Body: {itemId, fieldKey, cost} — cost null/"" clears it (back to the field's formula).
        fieldKey must be a non-total field in the Formulas page's Pricing Section C or D."""
        rfq, item, actor_name = self._sourcing_item(request)
        field_key = str(request.data.get("fieldKey") or "").strip()
        field, _section = _sourcing_field(field_key)
        raw_cost = request.data.get("cost")
        costs = dict(item.outsourced_field_costs or {})
        if raw_cost is None or raw_cost == "":
            costs.pop(field_key, None)
            text = f"cleared Sourcing cost for '{field.label}'"
        else:
            cost = _parse_cost(raw_cost)
            costs[field_key] = cost
            text = f"set Sourcing cost for '{field.label}' to {cost:g}"
        item.outsourced_field_costs = costs
        return self._save_and_respond(request, rfq, item, "outsourced_field_costs", actor_name, text)

    @action(detail=True, methods=["patch"], url_path="item-outsourced-field-mode")
    def set_outsourced_field_mode(self, request, pk=None):
        """Body: {itemId, fieldKey, mode} — In-house / Outsource / Logistics for a Pricing
        Section C or D field on this pulley. The section's own mode (C: In-house, D: Outsource)
        is the default and isn't stored; another mode moves the field's cost on the Pricing
        Tool page to that mode's section (In-house -> C, Outsource -> D, Logistics -> E)."""
        rfq, item, actor_name = self._sourcing_item(request)
        field_key = str(request.data.get("fieldKey") or "").strip()
        field, section = _sourcing_field(field_key)
        mode = _parse_mode(request.data.get("mode"))
        modes = dict(item.outsourced_field_modes or {})
        if mode == DEFAULT_MODE[section]:
            modes.pop(field_key, None)
        else:
            modes[field_key] = mode
        item.outsourced_field_modes = modes
        text = f"set mode of '{field.label}' to {mode}"
        return self._save_and_respond(request, rfq, item, "outsourced_field_modes", actor_name, text)

    @action(detail=True, methods=["patch"], url_path="item-outsourced-field-meta")
    def set_outsourced_field_meta(self, request, pk=None):
        """Body: {itemId, fieldKey, label?, hidden?} — rename (label; "" restores the Formulas
        page name) or remove/restore (hidden) a Pricing Section C / D row for this pulley only.
        A removed row's cost no longer counts on the Pricing Tool page."""
        rfq, item, actor_name = self._sourcing_item(request)
        field_key = str(request.data.get("fieldKey") or "").strip()
        field, _section = _sourcing_field(field_key)
        meta_all = dict(item.outsourced_field_meta or {})
        meta = dict(meta_all.get(field_key) or {})
        texts = []
        if "label" in request.data:
            label = str(request.data.get("label") or "").strip()
            if len(label) > MAX_LABEL_LENGTH:
                raise ValidationError({"label": f"At most {MAX_LABEL_LENGTH} characters."})
            if label and label != field.label:
                meta["label"] = label
                texts.append(f"renamed '{field.label}' to '{label}'")
            else:
                meta.pop("label", None)
                texts.append(f"restored the name of '{field.label}'")
        if "hidden" in request.data:
            if bool(request.data.get("hidden")):
                meta["hidden"] = True
                texts.append(f"removed '{field.label}'")
            else:
                meta.pop("hidden", None)
                texts.append(f"restored '{field.label}'")
        if meta:
            meta_all[field_key] = meta
        else:
            meta_all.pop(field_key, None)
        item.outsourced_field_meta = meta_all
        return self._save_and_respond(request, rfq, item, "outsourced_field_meta", actor_name, "; ".join(texts) or "no change")

    # ---- extra (custom) outsourced processes ---------------------------------------
    @action(detail=True, methods=["post", "patch", "delete"], url_path="item-custom-process")
    def custom_process(self, request, pk=None):
        if request.method == "POST":
            return self._add_custom_process(request)
        if request.method == "PATCH":
            return self._update_custom_process(request)
        return self._delete_custom_process(request)

    def _add_custom_process(self, request):
        """Body: {itemId, label, cost, vendorId?, vendorName?}."""
        rfq, item, actor_name = self._sourcing_item(request)
        entry = {
            "id": f"cp-{uuid.uuid4().hex[:12]}",
            "label": _parse_label(request.data.get("label")),
            "mode": _parse_mode(request.data.get("mode", OUTSOURCE)),
            "cost": _parse_cost(request.data.get("cost", 0)),
            **_vendor_fields(request.data),
        }
        item.custom_processes = list(item.custom_processes or []) + [entry]
        text = f"added outsourced process '{entry['label']}' ({entry['cost']:g})"
        return self._save_and_respond(request, rfq, item, "custom_processes", actor_name, text)

    def _update_custom_process(self, request):
        """Body: {itemId, id, label?, cost?, mode?, vendorId?, vendorName?, mhrRate?, runMin?, setupMin?}
        — only sent fields change. Sending any of mhrRate/runMin/setupMin (In-House Hours page)
        recalculates cost from them; sending cost alone (Sourcing screen) clears them."""
        rfq, item, actor_name = self._sourcing_item(request)
        entries = list(item.custom_processes or [])
        index = next((i for i, e in enumerate(entries) if e.get("id") == request.data.get("id")), None)
        if index is None:
            raise ValidationError({"id": "Custom process not found on this pulley."})
        entry = dict(entries[index])
        if "label" in request.data:
            entry["label"] = _parse_label(request.data.get("label"))
        data = request.data
        if any(k in data for k in HOUR_KEYS):
            # Set on the In-House Hours page: cost = MHR rate x (run + setup) minutes, the
            # same formula as that page's other rows.
            for k in HOUR_KEYS:
                if k in data:
                    entry[k] = None if data.get(k) in (None, "") else _parse_cost(data.get(k), k)
            if any(entry.get(k) is not None for k in HOUR_KEYS):
                entry["cost"] = round((entry.get("mhrRate") or 0) * ((entry.get("runMin") or 0) + (entry.get("setupMin") or 0)), 2)
        elif "cost" in data:
            # A cost typed on the Sourcing screen replaces the minutes-based one.
            entry["cost"] = _parse_cost(data.get("cost"))
            for k in HOUR_KEYS:
                entry.pop(k, None)
        if "mode" in request.data:
            entry["mode"] = _parse_mode(request.data.get("mode"))
        entry.update(_vendor_fields(request.data, entry))
        entries[index] = entry
        item.custom_processes = entries
        text = f"updated outsourced process '{entry['label']}' ({entry['cost']:g})"
        return self._save_and_respond(request, rfq, item, "custom_processes", actor_name, text)

    def _delete_custom_process(self, request):
        """Query (or body): itemId, id — a DELETE usually carries no body."""
        params = request.query_params
        item_id = params.get("itemId") or request.data.get("itemId")
        process_id = params.get("id") or request.data.get("id")
        rfq, item, actor_name = self._sourcing_item(request, item_id=item_id)
        entries = list(item.custom_processes or [])
        removed = next((e for e in entries if e.get("id") == process_id), None)
        if removed is None:
            raise ValidationError({"id": "Custom process not found on this pulley."})
        item.custom_processes = [e for e in entries if e.get("id") != process_id]
        text = f"removed outsourced process '{removed.get('label', '')}'"
        return self._save_and_respond(request, rfq, item, "custom_processes", actor_name, text)
