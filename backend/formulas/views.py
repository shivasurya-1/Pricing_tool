import re

from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import CanEditReferenceData

from .evaluator import FormulaError, evaluate_formula
from .models import FormulaDefinition, FormulaSection, FormulaVersion, TechDataFieldDefinition
from .serializers import (
    FormulaDefinitionSerializer,
    FormulaPreviewRequestSerializer,
    FormulaVersionSerializer,
    TechDataFieldCreateSerializer,
    TechDataFieldDefinitionSerializer,
)

# Variables the in-house-hours Auto formulas reference that aren't themselves a
# Technical Data Sheet field — injected at evaluation time from cost-rate lookups
# (see src/lib/pulleyTechDataCalc.ts's computeAutoFieldsDynamic). A new field's
# declared input_variables may reference these without tripping the
# unknown-variable rejection below.
INJECTED_RATE_VARIABLES = {f"{op}RateInrPerHour" for op in ("c1", "c2", "c3", "c4", "c5", "c6", "c7")}


class FormulaDefinitionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/formulas/            — list every formula, grouped by section
    GET  /api/formulas/{key}/      — one formula
    PATCH/PUT /api/formulas/{key}/ — edit its expression (Controlling/Admin only)
    POST /api/formulas/{key}/preview/  — evaluate a candidate expression without saving
    GET  /api/formulas/{key}/history/  — version history

    No create/delete — formulas are seeded once from the Formula Registry and only
    ever edited in place, never added/removed through the API.
    """

    queryset = FormulaDefinition.objects.all()
    serializer_class = FormulaDefinitionSerializer
    permission_classes = [CanEditReferenceData]
    lookup_field = "key"
    # DRF's router default lookup regex excludes '.' (reserved for format suffixes
    # like .json) — formula keys like "sectionA.a1" need it, so widen the pattern.
    lookup_value_regex = r"[^/]+"

    def perform_update(self, serializer):
        instance: FormulaDefinition = serializer.instance
        previous_expression = instance.expression
        new_expression = serializer.validated_data.get("expression", previous_expression)

        # Fail closed: refuse to save a formula that doesn't actually evaluate against
        # its own declared input variables (all defaulted to 1 as a smoke test).
        if new_expression != previous_expression:
            sample = {name: 1.0 for name in instance.input_variables}
            try:
                evaluate_formula(new_expression, sample)
            except FormulaError as exc:
                raise ValidationError({"expression": str(exc)})

        instance = serializer.save(updated_by=self.request.user)

        if new_expression != previous_expression:
            FormulaVersion.objects.create(
                formula=instance,
                previous_expression=previous_expression,
                new_expression=new_expression,
                changed_by=self.request.user,
            )

    @action(detail=True, methods=["post"])
    def preview(self, request, key=None):
        formula = self.get_object()
        req = FormulaPreviewRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        try:
            current_result = evaluate_formula(formula.expression, req.validated_data["variables"])
        except FormulaError as exc:
            current_result = None
            current_error = str(exc)
        else:
            current_error = None

        try:
            candidate_result = evaluate_formula(req.validated_data["expression"], req.validated_data["variables"])
            candidate_error = None
        except FormulaError as exc:
            candidate_result = None
            candidate_error = str(exc)

        return Response(
            {
                "current": {"result": current_result, "error": current_error},
                "candidate": {"result": candidate_result, "error": candidate_error},
            }
        )

    @action(detail=True, methods=["get"])
    def history(self, request, key=None):
        formula = self.get_object()
        versions = formula.versions.all()
        return Response(FormulaVersionSerializer(versions, many=True).data)


class TechDataFieldDefinitionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/formulas/tech-data-fields/       — every field on the Technical Data Sheet
    GET    /api/formulas/tech-data-fields/{key}/ — one field
    POST   /api/formulas/tech-data-fields/       — add a new field, Manual or Auto (Controlling/Admin)
    PATCH  /api/formulas/tech-data-fields/{key}/ — edit label/unit/section/options/order
    DELETE /api/formulas/tech-data-fields/{key}/ — only a non-core field nothing else references

    Unlike FormulaDefinitionViewSet, create/delete ARE exposed here — this is the point
    of the feature (letting Controlling/Admin extend the sheet without a deploy), done
    with the extra validation below so it can't silently corrupt the pricing engine.
    """

    queryset = TechDataFieldDefinition.objects.select_related("formula").all()
    serializer_class = TechDataFieldDefinitionSerializer
    permission_classes = [CanEditReferenceData]
    lookup_field = "key"
    lookup_value_regex = r"[^/]+"

    def get_serializer_class(self):
        if self.action == "create":
            return TechDataFieldCreateSerializer
        return TechDataFieldDefinitionSerializer

    def create(self, request, *args, **kwargs):
        req = TechDataFieldCreateSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        data = req.validated_data

        if TechDataFieldDefinition.objects.filter(key=data["key"]).exists():
            raise ValidationError({"key": "A field with this key already exists."})

        if data["is_auto"]:
            known_keys = set(TechDataFieldDefinition.objects.values_list("key", flat=True)) | {data["key"]}
            unknown = [v for v in data["input_variables"] if v not in known_keys and v not in INJECTED_RATE_VARIABLES]
            if unknown:
                raise ValidationError({"input_variables": f"Unknown variable(s), not a field on this sheet: {', '.join(unknown)}"})

            sample = {name: 1.0 for name in data["input_variables"]}
            try:
                evaluate_formula(data["expression"], sample)
            except FormulaError as exc:
                raise ValidationError({"expression": str(exc)})

        with transaction.atomic():
            formula = None
            if data["is_auto"]:
                formula = FormulaDefinition.objects.create(
                    key=data["key"],
                    label=data["label"],
                    section=FormulaSection.TECH_DATA_AUTO,
                    expression=data["expression"],
                    input_variables=data["input_variables"],
                    output_unit=data["output_unit"],
                    updated_by=request.user,
                )
            field = TechDataFieldDefinition.objects.create(
                key=data["key"],
                label=data["label"],
                section=data["section"],
                unit=data["unit"],
                field_type=data["field_type"],
                options=data["options"],
                formula=formula,
                order=data["order"],
                is_core=False,
                created_by=request.user,
            )

        return Response(TechDataFieldDefinitionSerializer(field).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        field: TechDataFieldDefinition = serializer.instance
        requested_type = self.request.data.get("field_type")
        if requested_type is not None and requested_type != field.field_type:
            raise ValidationError({"field_type": "Cannot be changed after creation."})
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        field: TechDataFieldDefinition = self.get_object()
        if field.is_core:
            raise ValidationError({"detail": f"'{field.key}' is a core sheet field and can't be deleted."})

        blockers = []
        for other in FormulaDefinition.objects.exclude(key=field.key):
            referenced_in_vars = field.key in (other.input_variables or [])
            referenced_in_expr = bool(re.search(rf"\b{re.escape(field.key)}\b", other.expression))
            if referenced_in_vars or referenced_in_expr:
                blockers.append(other.key)

        if blockers:
            raise ValidationError({"detail": f"Still referenced by: {', '.join(blockers)}. Remove those formulas' dependency on it first."})

        with transaction.atomic():
            formula = field.formula
            field.delete()
            if formula is not None:
                formula.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
