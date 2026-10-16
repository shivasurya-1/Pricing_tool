from rest_framework import serializers

from .catalog_options import catalog_link_info, catalog_option_value, catalog_options, is_label_valued
from .evaluator import copy_source
from .models import TECH_DATA_AUTO_SECTION_LABEL, FormulaDefinition, FormulaVersion, Section, SectionTab, TechDataFieldDefinition


def validate_registered_section(value: str) -> str:
    """A formula's/field's section decides which sheet it shows on (Section.tab), so it
    must be a section from the Manage Sections registry — not free text."""
    value = value.strip()
    if not Section.objects.filter(label=value).exists():
        raise serializers.ValidationError(f"'{value}' isn't a known section — add it under Manage Sections first.")
    return value


class SheetMixin(serializers.Serializer):
    """Read-only `sheet`: which sheet ("pricing_tool" / "tech_sheet") this row belongs
    to, resolved from its section's Section.tab. The label->tab map is fetched once
    and cached on the (shared, for many=True) serializer context — no N+1."""

    sheet = serializers.SerializerMethodField()
    # Used when a row's section isn't in the registry (legacy data).
    default_sheet = SectionTab.PRICING_TOOL

    def get_sheet(self, obj) -> str:
        tabs = self.context.get("_section_tabs")
        if tabs is None:
            tabs = dict(Section.objects.values_list("label", "tab"))
            self.context["_section_tabs"] = tabs
        if obj.section in tabs:
            return tabs[obj.section]
        if obj.section == TECH_DATA_AUTO_SECTION_LABEL:
            return SectionTab.TECH_SHEET
        return self.default_sheet


class FormulaVersionSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", default=None, read_only=True)

    class Meta:
        model = FormulaVersion
        fields = ["id", "previous_expression", "new_expression", "changed_by_name", "changed_at", "note"]


class FormulaDefinitionSerializer(SheetMixin, serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source="updated_by.username", default=None, read_only=True)

    class Meta:
        model = FormulaDefinition
        fields = [
            "id",
            "key",
            "label",
            "section",
            "sheet",
            "expression",
            "input_variables",
            "output_unit",
            "order",
            "updated_by_name",
            "updated_at",
        ]
        read_only_fields = ["id", "key", "label", "section", "input_variables", "output_unit", "order", "updated_by_name", "updated_at"]
        # `expression` is the only field a client may PATCH — everything else is fixed metadata
        # describing what the field is, not something an editor should be able to rename.


class FormulaCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormulaDefinition
        fields = ["id", "key", "label", "section", "expression", "input_variables", "output_unit", "order"]
        read_only_fields = ["id"]

    def validate_section(self, value):
        return validate_registered_section(value)


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ["id", "key", "label", "order", "tab"]
        read_only_fields = ["id", "key"]
        # `key` is fixed at create time (it's how existing formulas/fields already
        # reference a section that predates this API, by label match) — renaming is
        # done by changing `label`, which SectionViewSet.perform_update cascades to
        # every FormulaDefinition/TechDataFieldDefinition row that used the old one.
        # `label`, `order` and `tab` are all editable (see perform_update for the
        # one built-in section whose label/tab stay locked).

    def validate_label(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Section name can't be blank.")
        return value


class SectionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = ["id", "key", "label", "order", "tab"]
        read_only_fields = ["id"]


class FormulaPreviewRequestSerializer(serializers.Serializer):
    expression = serializers.CharField()
    variables = serializers.DictField(child=serializers.FloatField(), required=False, default=dict)


class TechDataFieldDefinitionSerializer(SheetMixin, serializers.ModelSerializer):
    """Read/list representation — a Manual field simply has null formula-derived fields."""

    default_sheet = SectionTab.TECH_SHEET

    is_auto = serializers.BooleanField(read_only=True)
    is_read_only = serializers.BooleanField(read_only=True)
    formula_key = serializers.CharField(source="formula.key", read_only=True, default=None)
    expression = serializers.CharField(source="formula.expression", read_only=True, default=None)
    input_variables = serializers.JSONField(source="formula.input_variables", read_only=True, default=list)
    output_unit = serializers.CharField(source="formula.output_unit", read_only=True, default="")
    # Set when an Auto field's formula is just one key: the client copies that field's
    # value as-is (text, number or selected option) instead of evaluating arithmetic.
    copy_from = serializers.SerializerMethodField()

    class Meta:
        model = TechDataFieldDefinition
        fields = [
            "id", "key", "label", "section", "sheet", "unit", "field_type", "options", "options_source", "fixed_value",
            "is_auto", "is_catalog_derived", "is_read_only", "formula_key", "expression", "copy_from",
            "input_variables", "output_unit", "order", "is_core", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "is_auto", "is_catalog_derived", "is_read_only", "formula_key",
            "expression", "input_variables", "output_unit", "is_core", "created_at", "updated_at",
        ]
        # `key` is writable on PATCH (renaming is cascaded to formulas, and blocked for
        # core fields, in TechDataFieldDefinitionViewSet.perform_update). `field_type`
        # rules and the Manual/Auto switch (see TechDataFieldModeSerializer) are also
        # enforced in the view.

    def get_copy_from(self, obj) -> str | None:
        return copy_source(obj.formula.expression) if obj.formula_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # A select linked to a reference catalog lists that catalog's rows live (see
        # catalog_options.py) instead of the copy saved when it was linked; `catalog`
        # says which table, and option_prices maps each option to its catalog price.
        options = None
        if instance.field_type == "select":
            options = catalog_options(instance.options_source, cache=self.context.setdefault("_catalog_options", {}))
        # `catalog_prices` is every option's catalog price, for looking up a paired price
        # field (e.g. bearing1Price from bearing1Designation). `option_prices` is what the
        # field's own value stands for — null when its value is the label itself, so the
        # sheet shows and calculates with the picked label, not a price.
        if options is None:
            data["catalog"] = None
            data["option_prices"] = None
            data["catalog_prices"] = None
        else:
            prices = {o["label"]: o["price"] for o in options}
            data["options"] = [o["label"] for o in options]
            data["catalog"] = catalog_link_info(instance.options_source)
            data["catalog_prices"] = prices
            data["option_prices"] = None if is_label_valued(instance.options_source) else prices
        data["fixed_numeric_value"] = self._fixed_numeric_value(instance, options)
        return data

    @staticmethod
    def _fixed_numeric_value(instance, options) -> float | None:
        """What the fixed value stands for when its key is used in a calculation: a
        catalog-linked select's picked row value (price) — none when the field's value is
        the label itself — else the value itself if numeric."""
        if not instance.fixed_value:
            return None
        if options is not None:
            if is_label_valued(instance.options_source):
                return None
            return catalog_option_value(options, instance.fixed_value)
        try:
            return float(instance.fixed_value)
        except ValueError:
            return None

    def validate_section(self, value):
        # An edit that leaves a legacy (unregistered) section unchanged stays allowed.
        if self.instance is not None and value.strip() == self.instance.section:
            return self.instance.section
        return validate_registered_section(value)


class TechDataFieldModeSerializer(serializers.Serializer):
    """The Manual/Auto part of a tech-data field PATCH. Kept separate from
    TechDataFieldDefinitionSerializer because `is_auto` is a model property (derived
    from `formula`) and `expression` etc. live on the linked FormulaDefinition — the
    view applies these itself rather than letting ModelSerializer.update() setattr them."""

    is_auto = serializers.BooleanField(required=False)
    expression = serializers.CharField(required=False, allow_blank=True)
    input_variables = serializers.ListField(child=serializers.CharField(), required=False)
    output_unit = serializers.CharField(max_length=20, required=False, allow_blank=True)


class TechDataFieldCreateSerializer(serializers.Serializer):
    """Validates the shape of a new-field request; TechDataFieldDefinitionViewSet.create()
    does the cross-field checks (unknown variables, expression dry-run) and the actual
    atomic create, since those need access to every other field's key — not something a
    single serializer's .validate() can cleanly own."""

    key = serializers.SlugField(max_length=80)
    label = serializers.CharField(max_length=200)
    section = serializers.CharField(max_length=100)
    unit = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    field_type = serializers.ChoiceField(choices=["text", "number", "select"])
    options = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    order = serializers.IntegerField(required=False, default=0)

    is_auto = serializers.BooleanField(default=False)
    expression = serializers.CharField(required=False, allow_blank=True, default="")
    input_variables = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    output_unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")

    def validate_section(self, value):
        return validate_registered_section(value)

    def validate(self, data):
        if data["field_type"] == "select" and not data.get("options") and data["is_auto"] is False:
            raise serializers.ValidationError({"options": "A Manual select field needs at least one option."})
        if data["is_auto"] and not data.get("expression", "").strip():
            raise serializers.ValidationError({"expression": "Required for an Auto field."})
        return data
