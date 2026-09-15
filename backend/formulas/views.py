from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import CanEditReferenceData

from .evaluator import FormulaError, evaluate_formula
from .models import FormulaDefinition, FormulaVersion
from .serializers import (
    FormulaDefinitionSerializer,
    FormulaPreviewRequestSerializer,
    FormulaVersionSerializer,
)


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
