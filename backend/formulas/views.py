import re

from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import CanEditReferenceData, IsAdminRole

from .evaluator import FormulaError, evaluate_formula
from .models import (
    TECH_DATA_AUTO_SECTION_KEY,
    TECH_DATA_AUTO_SECTION_LABEL,
    FormulaDefinition,
    FormulaVersion,
    Section,
    SectionTab,
    TechDataFieldDefinition,
)
from .serializers import (
    FormulaCreateSerializer,
    FormulaDefinitionSerializer,
    FormulaPreviewRequestSerializer,
    FormulaVersionSerializer,
    SectionCreateSerializer,
    SectionSerializer,
    TechDataFieldCreateSerializer,
    TechDataFieldDefinitionSerializer,
)

# Variables the in-house-hours Auto formulas reference that aren't themselves a
# Technical Data Sheet field — injected at evaluation time from cost-rate lookups
# (see src/lib/pulleyTechDataCalc.ts's computeAutoFieldsDynamic). A new field's
# declared input_variables may reference these without tripping the
# unknown-variable rejection below.
INJECTED_RATE_VARIABLES = {f"{op}RateInrPerHour" for op in ("c1", "c2", "c3", "c4", "c5", "c6", "c7")}


def known_variable_keys(extra_key: str | None = None) -> set[str]:
    """Every name a new formula's or field's expression is allowed to reference —
    shared by both create() methods below so a formula can reference a tech-data
    field's key and vice versa."""
    keys = set(FormulaDefinition.objects.values_list("key", flat=True))
    keys |= set(TechDataFieldDefinition.objects.values_list("key", flat=True))
    keys |= INJECTED_RATE_VARIABLES
    if extra_key:
        keys.add(extra_key)
    return keys


class FormulaDefinitionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET    /api/formulas/            — list every formula, grouped by section
    GET    /api/formulas/{key}/      — one formula
    POST   /api/formulas/            — add a new formula (Controlling/Admin)
    PATCH/PUT /api/formulas/{key}/   — edit its expression (Controlling/Admin only)
    DELETE /api/formulas/{key}/      — only if nothing still depends on it
    POST   /api/formulas/delete-all/ — wipe every formula (Admin only)
    POST   /api/formulas/{key}/preview/  — evaluate a candidate expression without saving
    GET    /api/formulas/{key}/history/  — version history
    """

    queryset = FormulaDefinition.objects.all()
    serializer_class = FormulaDefinitionSerializer
    permission_classes = [CanEditReferenceData]
    lookup_field = "key"
    # DRF's router default lookup regex excludes '.' (reserved for format suffixes
    # like .json) — formula keys like "sectionA.a1" need it, so widen the pattern.
    lookup_value_regex = r"[^/]+"

    def get_serializer_class(self):
        if self.action == "create":
            return FormulaCreateSerializer
        return FormulaDefinitionSerializer

    def create(self, request, *args, **kwargs):
        serializer = FormulaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if FormulaDefinition.objects.filter(key=data["key"]).exists():
            raise ValidationError({"key": "A formula with this key already exists."})

        known_keys = known_variable_keys(extra_key=data["key"])
        unknown = [v for v in data["input_variables"] if v not in known_keys]
        if unknown:
            raise ValidationError({"input_variables": f"Unknown variable(s): {', '.join(unknown)}"})

        sample = {name: 1.0 for name in data["input_variables"]}
        try:
            evaluate_formula(data["expression"], sample)
        except FormulaError as exc:
            raise ValidationError({"expression": str(exc)})

        formula = FormulaDefinition.objects.create(**data, updated_by=request.user)
        return Response(FormulaDefinitionSerializer(formula).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        formula: FormulaDefinition = self.get_object()
        blockers = []
        if hasattr(formula, "tech_data_field"):
            blockers.append(f"is the Auto source for Technical Data Sheet field '{formula.tech_data_field.key}'")
        for other in FormulaDefinition.objects.exclude(key=formula.key):
            referenced_in_vars = formula.key in (other.input_variables or [])
            referenced_in_expr = bool(re.search(rf"\b{re.escape(formula.key)}\b", other.expression))
            if referenced_in_vars or referenced_in_expr:
                blockers.append(f"referenced by formula '{other.key}'")
        if blockers:
            raise ValidationError({"detail": f"Can't delete '{formula.key}': {'; '.join(blockers)}."})
        formula.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="delete-all", permission_classes=[IsAdminRole])
    def delete_all(self, request):
        """Deletes every formula. Safe by construction: TechDataFieldDefinition.formula
        is on_delete=SET_NULL, so any Auto field just reverts to a plain Manual field
        rather than erroring or orphaning — nothing else needs cleaning up."""
        deleted_count, _ = FormulaDefinition.objects.all().delete()
        return Response({"deleted": deleted_count})

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
            known_keys = known_variable_keys(extra_key=data["key"])
            unknown = [v for v in data["input_variables"] if v not in known_keys]
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
                    section=TECH_DATA_AUTO_SECTION_LABEL,
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
        requested_type = serializer.validated_data.get("field_type", field.field_type)
        extra = {}
        if requested_type != field.field_type:
            # Auto/catalog-derived fields have no user-typed value, so their type is tied
            # to the formula/catalog wiring and stays locked. A core field's type can be
            # changed, but only by an Admin — same rule as deleting one.
            if field.is_auto or field.is_catalog_derived:
                raise ValidationError({"field_type": "Can't be changed on an Auto or catalog-derived field."})
            if field.is_core and not self.request.user.is_admin:
                raise ValidationError({"field_type": f"'{field.key}' is a core sheet field — only an Admin can change its type."})
        if requested_type == "select" and not field.is_read_only:
            options = serializer.validated_data.get("options", field.options)
            if not options:
                raise ValidationError({"options": "A Manual select field needs at least one option."})
        elif requested_type != "select":
            extra["options"] = []

        fixed_value = str(serializer.validated_data.get("fixed_value", field.fixed_value)).strip()
        if fixed_value:
            if field.is_read_only:
                raise ValidationError({"fixed_value": "An Auto or catalog-derived field can't have a fixed value."})
            final_options = extra.get("options", serializer.validated_data.get("options", field.options))
            if requested_type == "select" and fixed_value not in final_options:
                raise ValidationError({"fixed_value": f"'{fixed_value}' isn't one of this field's options."})
            if requested_type == "number":
                try:
                    float(fixed_value)
                except ValueError:
                    raise ValidationError({"fixed_value": "Must be a number for a Number field."})
        extra["fixed_value"] = fixed_value
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        field: TechDataFieldDefinition = self.get_object()
        if field.is_core and not request.user.is_admin:
            raise ValidationError({"detail": f"'{field.key}' is a core sheet field — only an Admin can delete it."})

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


class SectionViewSet(viewsets.ModelViewSet):
    """
    A user-managed registry of section names shared by FormulaDefinition and
    TechDataFieldDefinition — both just store a section's `label` as a plain string
    (see Section's docstring in models.py for why), so renaming here cascades to
    every row that used the old label, and deleting is blocked while any row still
    does.

    PATCH /api/formulas/sections/{id}/ — edit label, order and/or tab
    """

    queryset = Section.objects.all()
    serializer_class = SectionSerializer
    permission_classes = [CanEditReferenceData]

    def get_serializer_class(self):
        if self.action == "create":
            return SectionCreateSerializer
        return SectionSerializer

    def perform_update(self, serializer):
        section: Section = serializer.instance
        old_label = section.label
        new_label = serializer.validated_data.get("label", old_label)
        new_tab = serializer.validated_data.get("tab", section.tab)

        # TechDataFieldDefinitionViewSet.create files every new Auto field's formula
        # under the hardcoded TECH_DATA_AUTO_SECTION_LABEL — renaming or re-tabbing
        # that one row would orphan every future Auto formula from its section.
        if section.key == TECH_DATA_AUTO_SECTION_KEY:
            if new_label != old_label:
                raise ValidationError({"label": "The built-in Auto Fields section can't be renamed."})
            if new_tab != SectionTab.TECH_SHEET:
                raise ValidationError({"tab": "The built-in Auto Fields section must stay on the Technical Sheet tab."})

        with transaction.atomic():
            serializer.save()
            if new_label != old_label:
                FormulaDefinition.objects.filter(section=old_label).update(section=new_label)
                TechDataFieldDefinition.objects.filter(section=old_label).update(section=new_label)

    def destroy(self, request, *args, **kwargs):
        section: Section = self.get_object()
        in_use = (
            FormulaDefinition.objects.filter(section=section.label).exists()
            or TechDataFieldDefinition.objects.filter(section=section.label).exists()
        )
        if in_use:
            raise ValidationError({"detail": f"'{section.label}' still has formulas or fields assigned to it. Move or delete those first."})
        return super().destroy(request, *args, **kwargs)
