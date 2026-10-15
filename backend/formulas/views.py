import re

from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import CanEditReferenceData, IsAdminRole
from reference.models import GlobalParameter, LogisticsPackingRate, MachiningLabourRate, MaterialRate

from .catalog_options import (
    catalog_labels_for_value,
    catalog_link_info,
    catalog_option_value,
    catalog_options,
    picked_catalog_label,
)
from .evaluator import FormulaError, copy_source, evaluate_formula, extract_variables
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
    TechDataFieldModeSerializer,
)

# Variables the in-house-hours Auto formulas reference that aren't themselves a
# Technical Data Sheet field — injected at evaluation time from cost-rate lookups
# (see src/lib/pulleyTechDataCalc.ts's computeAutoFieldsDynamic). A new field's
# declared input_variables may reference these without tripping the
# unknown-variable rejection below.
INJECTED_RATE_VARIABLES = {f"{op}RateInrPerHour" for op in ("c1", "c2", "c3", "c4", "c5", "c6", "c7")}

# Catalog prices the frontend looks up and injects whenever their designation field
# changes (src/data/pulleyTechDataSchema.ts's PRICE_FIELD_SOURCE: price key -> the
# designation field key it's looked up from). Like the rate variables above, they're
# valid in an expression even when no Technical Data Sheet field has that key.
CATALOG_PRICE_VARIABLES = {
    "bearing1Price": "bearing1Designation",
    "bearing2Price": "bearing2Designation",
    "sleevePrice": "sleeveCode",
    "housingPrice": "housingDesignation",
    "lockingDevicePrice": "lockingDeviceType",
    "laggingRate": "laggingType",
}


# The four Cost Rate Tables (reference app), with the column holding each row's
# display label and numeric value — the client's formulaStore.costRates is built
# from exactly these (key -> value), so every key here is a valid formula variable.
COST_RATE_TABLES = [
    ("global_parameters", "Global Parameters", GlobalParameter, "parameter", "value", "unit"),
    ("material_rates", "Material Rates", MaterialRate, "material", "inr_per_kg", None),
    ("machining_labour_rates", "Machining & Labour Rates", MachiningLabourRate, "operation", "inr_per_hour", None),
    ("logistics_packing_rates", "Logistics & Packing Rates", LogisticsPackingRate, "item", "rate", "unit"),
]
COST_RATE_DEFAULT_UNITS = {"material_rates": "INR/kg", "machining_labour_rates": "INR/h"}


def cost_rate_keys() -> set[str]:
    keys: set[str] = set()
    for _, _, model, *_ in COST_RATE_TABLES:
        keys |= set(model.objects.values_list("key", flat=True))
    return keys


def known_variable_keys(extra_key: str | None = None) -> set[str]:
    """Every name a new formula's or field's expression is allowed to reference —
    shared by both create() methods below so a formula can reference a tech-data
    field's key and vice versa."""
    keys = set(FormulaDefinition.objects.values_list("key", flat=True))
    keys |= set(TechDataFieldDefinition.objects.values_list("key", flat=True))
    keys |= INJECTED_RATE_VARIABLES
    keys |= set(CATALOG_PRICE_VARIABLES)
    keys |= cost_rate_keys()
    if extra_key:
        keys.add(extra_key)
    return keys


def _is_number(value) -> bool:
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True


def resolve_expression_variables(expression: str, self_key: str | None = None) -> list[str]:
    """Validates `expression` and returns the variables it actually references, which
    becomes the formula's stored `input_variables` — derived here rather than trusted
    from the client, because the frontend orders Auto-field evaluation by that list
    (pulleyTechDataCalc.ts's computeAutoFieldsDynamic), so a variable used but not
    declared gets read before it's been calculated.

    Rejects what would otherwise silently evaluate to 0 (both evaluators read an
    unknown or non-numeric variable as 0): unknown names (typos), the formula's own key,
    and — in arithmetic — select fields whose options aren't numbers (e.g. a bearing
    designation code; reference its catalog price variable instead). A catalog-linked
    select is allowed: in a calculation it stands for the picked row's value column
    (its `option_prices` entry), not its label. A copy formula
    (just one key, see evaluator.copy_source) may reference any field type, since its
    value is copied as-is rather than calculated."""
    names = extract_variables(expression)
    unknown = [n for n in names if n not in known_variable_keys()]
    if unknown:
        raise ValidationError({"expression": f"Unknown variable(s): {', '.join(unknown)}. Use a field key from this sheet."})
    if self_key and self_key in names:
        raise ValidationError({"expression": f"A formula can't reference its own key '{self_key}'."})
    if copy_source(expression):
        return names

    non_numeric = []
    for field in TechDataFieldDefinition.objects.filter(key__in=names, field_type="select", formula__isnull=True):
        if catalog_link_info(field.options_source) is not None:
            continue
        if not field.options or not all(_is_number(o) for o in field.options):
            non_numeric.append(field.key)
    if non_numeric:
        hints = [f"'{p}'" for p, source in CATALOG_PRICE_VARIABLES.items() if source in non_numeric]
        hint = f" To use a catalog price, reference {', '.join(hints)} instead." if hints else ""
        raise ValidationError({
            "expression": f"{', '.join(non_numeric)} hold text (codes/designations), not numbers, so they can't be "
            f"used in a calculation.{hint} To copy the value as-is, make the formula just the key on its own."
        })

    try:
        evaluate_formula(expression, {name: 1.0 for name in names})
    except FormulaError as exc:
        raise ValidationError({"expression": str(exc)})
    return names


def validate_auto_field_type(field_type: str, expression: str) -> None:
    """A calculation always produces a number, so a Text/Select Auto field must use a
    copy formula (just one key, e.g. "bearing1Designation") — anything else would show 0."""
    if field_type != "number" and not copy_source(expression):
        raise ValidationError({
            "is_auto": "A Text or Select Auto field can only copy another field — make the formula just that field's "
            "key (e.g. bearing1Designation). Calculations need a Number field."
        })


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
    GET    /api/formulas/variables/  — every variable an expression may use (fields, formulas, cost rates, ...)
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

    @action(detail=False, methods=["get"])
    def variables(self, request):
        """GET /api/formulas/variables/ — every name a formula expression may reference,
        grouped for the "Insert a field" pickers — the same set known_variable_keys()
        validates against, so anything listed here will be accepted on save."""
        fields = [
            {"key": f.key, "label": f.label, "section": f.section, "field_type": f.field_type, "is_auto": f.is_auto}
            for f in TechDataFieldDefinition.objects.select_related("formula").order_by("section", "order", "key")
        ]
        field_keys = {f["key"] for f in fields}
        formulas = [
            {"key": f.key, "label": f.label, "section": f.section, "output_unit": f.output_unit}
            for f in FormulaDefinition.objects.exclude(key__in=field_keys).order_by("section", "order", "key")
        ]
        cost_rates = []
        for table, table_label, model, label_attr, value_attr, unit_attr in COST_RATE_TABLES:
            for row in model.objects.order_by("order", "key"):
                cost_rates.append({
                    "key": row.key,
                    "label": getattr(row, label_attr),
                    "value": getattr(row, value_attr),
                    "unit": getattr(row, unit_attr) if unit_attr else COST_RATE_DEFAULT_UNITS.get(table, ""),
                    "table": table,
                    "table_label": table_label,
                })
        return Response({
            "fields": fields,
            "formulas": formulas,
            "cost_rates": cost_rates,
            "labour_rate_lookups": sorted(INJECTED_RATE_VARIABLES),
            "catalog_prices": [
                {"key": price_key, "source_field": source} for price_key, source in CATALOG_PRICE_VARIABLES.items()
            ],
        })

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
    PATCH  /api/formulas/tech-data-fields/{key}/ — edit key/label/unit/section/options/order,
                                                  switch Manual<->Auto (is_auto + expression)
    DELETE /api/formulas/tech-data-fields/{key}/ — only a non-core field nothing else references
    GET    /api/formulas/tech-data-fields/dropdown-options/ — live catalog options + prices per linked select

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
            validate_auto_field_type(data["field_type"], data["expression"])
            data["input_variables"] = resolve_expression_variables(data["expression"], self_key=data["key"])

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
        mode_req = TechDataFieldModeSerializer(data=self.request.data)
        mode_req.is_valid(raise_exception=True)
        mode = mode_req.validated_data

        old_key = field.key
        new_key = serializer.validated_data.get("key", old_key)
        was_auto = field.is_auto
        wants_auto = mode.get("is_auto", was_auto)

        # Core fields' keys are referenced directly by the frontend's hardcoded
        # schema/calc code, so renaming one would silently break those lookups.
        if new_key != old_key and field.is_core:
            raise ValidationError({"key": f"'{old_key}' is a core sheet field — its key can't be changed."})
        # An Auto field's formula shares its key, so that key must be free among formulas too.
        if wants_auto and (new_key != old_key or not was_auto):
            clash = FormulaDefinition.objects.filter(key=new_key)
            if field.formula_id:
                clash = clash.exclude(pk=field.formula_id)
            if clash.exists():
                raise ValidationError({"key": f"A formula with the key '{new_key}' already exists."})

        if wants_auto and field.is_catalog_derived:
            raise ValidationError({"is_auto": "A catalog-derived field can't be switched to Auto."})
        target_read_only = wants_auto or field.is_catalog_derived

        # Validate the expression whenever this save will leave the field Auto with a
        # new (or first) expression — same checks as create().
        expression = mode.get("expression")
        requested_type = serializer.validated_data.get("field_type", field.field_type)
        # The variables the saved formula will declare — always derived from its
        # expression (see resolve_expression_variables), never taken from the client.
        input_variables = None
        if wants_auto:
            if not was_auto and not (expression or "").strip():
                raise ValidationError({"expression": "Required for an Auto field."})
            if expression is not None and (not was_auto or expression != field.formula.expression):
                if not expression.strip():
                    raise ValidationError({"expression": "Required for an Auto field."})
                validate_auto_field_type(requested_type, expression)
                input_variables = resolve_expression_variables(expression, self_key=new_key)

        extra = {}
        # A catalog-linked select lists the catalog live (catalog_options.py), so that —
        # not the saved copy in `options` — is what a fixed value must be one of.
        options_source = serializer.validated_data.get("options_source", field.options_source)
        live_options = catalog_options(options_source) if requested_type == "select" else None
        if requested_type != field.field_type:
            # Auto/catalog-derived fields have no user-typed value, so their type is tied
            # to the formula/catalog wiring and stays locked (unless this same save turns
            # an Auto field back to Manual). A core field's type is Admin-only — same rule
            # as deleting one.
            if field.is_catalog_derived or (was_auto and wants_auto):
                raise ValidationError({"field_type": "Can't be changed on an Auto or catalog-derived field."})
            if field.is_core and not self.request.user.is_admin:
                raise ValidationError({"field_type": f"'{field.key}' is a core sheet field — only an Admin can change its type."})
        if requested_type == "select" and not target_read_only and live_options is None:
            options = serializer.validated_data.get("options", field.options)
            if not options:
                raise ValidationError({"options": "A Manual select field needs at least one option."})
        elif requested_type != "select":
            extra["options"] = []

        if target_read_only:
            # Only reject a fixed value the client actually sent; a Manual field's old
            # fixed value is just cleared when it's switched to Auto.
            if str(serializer.validated_data.get("fixed_value", "")).strip():
                raise ValidationError({"fixed_value": "An Auto or catalog-derived field can't have a fixed value."})
            fixed_value = ""
        else:
            fixed_value = str(serializer.validated_data.get("fixed_value", field.fixed_value)).strip()
        if fixed_value:
            if live_options is not None:
                final_options = [o["label"] for o in live_options]
            else:
                final_options = extra.get("options", serializer.validated_data.get("options", field.options))
            if requested_type == "select" and fixed_value not in final_options:
                # The catalog picker resolves a pick to the row's value column (e.g. its
                # price), so map a value back to its row's label — the label is what the
                # dropdown shows and what the sheet stores.
                matches = catalog_labels_for_value(live_options, fixed_value) if live_options is not None else []
                # Several rows can share one value (e.g. two shell bands at 110/kg); the
                # picker also records the row actually picked as options_source's last part.
                picked_label = picked_catalog_label(options_source)
                if picked_label in matches:
                    matches = [picked_label]
                if len(matches) == 1:
                    fixed_value = matches[0]
                elif len(matches) > 1:
                    raise ValidationError({
                        "fixed_value": f"'{fixed_value}' is the value of several catalog rows ({', '.join(matches)}) — "
                        "pick the row itself instead."
                    })
                else:
                    where = " (it's no longer in the linked catalog)" if live_options is not None else ""
                    raise ValidationError({"fixed_value": f"'{fixed_value}' isn't one of this field's options{where}."})
            if requested_type == "number":
                try:
                    float(fixed_value)
                except ValueError:
                    raise ValidationError({"fixed_value": "Must be a number for a Number field."})
        extra["fixed_value"] = fixed_value

        with transaction.atomic():
            formula = field.formula
            if was_auto and not wants_auto:
                # Auto -> Manual: unlink first, then drop the now-orphaned formula.
                extra["formula"] = None
            elif wants_auto and not was_auto:
                formula = FormulaDefinition.objects.create(
                    key=new_key,
                    label=serializer.validated_data.get("label", field.label),
                    section=TECH_DATA_AUTO_SECTION_LABEL,
                    expression=expression,
                    input_variables=input_variables,
                    output_unit=mode.get("output_unit", ""),
                    updated_by=self.request.user,
                )
                extra["formula"] = formula
            elif wants_auto:
                previous_expression = formula.expression
                formula.key = new_key
                formula.label = serializer.validated_data.get("label", formula.label)
                if input_variables is not None:
                    formula.expression = expression
                    formula.input_variables = input_variables
                if "output_unit" in mode:
                    formula.output_unit = mode["output_unit"]
                formula.updated_by = self.request.user
                formula.save()
                if formula.expression != previous_expression:
                    FormulaVersion.objects.create(
                        formula=formula,
                        previous_expression=previous_expression,
                        new_expression=formula.expression,
                        changed_by=self.request.user,
                    )

            serializer.save(**extra)

            if was_auto and not wants_auto:
                formula.delete()

            if new_key != old_key:
                self._rename_references(old_key, new_key)

    @action(detail=False, methods=["get"], url_path="dropdown-options")
    def dropdown_options(self, request):
        """GET /api/formulas/tech-data-fields/dropdown-options/ — every catalog-linked
        select field's live options with their catalog price, keyed by field key, so the
        RFQ sheet can render the dropdowns and fill the matching price in one call."""
        cache = {}
        result = {}
        for field in TechDataFieldDefinition.objects.filter(field_type="select").exclude(options_source=""):
            options = catalog_options(field.options_source, cache=cache)
            if options is None:
                continue
            result[field.key] = {
                **catalog_link_info(field.options_source),
                "label": field.label,
                "fixed_value": field.fixed_value,
                "fixed_numeric_value": catalog_option_value(options, field.fixed_value) if field.fixed_value else None,
                "options": options,
            }
        return Response(result)

    def _rename_references(self, old_key: str, new_key: str) -> None:
        """Point every formula that referenced `old_key` (by expression or declared
        input variable) at `new_key`, keeping an audit entry for each expression change."""
        pattern = re.compile(rf"\b{re.escape(old_key)}\b")
        for other in FormulaDefinition.objects.exclude(key=new_key):
            in_vars = old_key in (other.input_variables or [])
            new_expression = pattern.sub(new_key, other.expression)
            if not in_vars and new_expression == other.expression:
                continue
            if in_vars:
                other.input_variables = [new_key if v == old_key else v for v in other.input_variables]
            if new_expression != other.expression:
                FormulaVersion.objects.create(
                    formula=other,
                    previous_expression=other.expression,
                    new_expression=new_expression,
                    changed_by=self.request.user,
                    note=f"Renamed variable '{old_key}' to '{new_key}'",
                )
                other.expression = new_expression
            other.save()

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
