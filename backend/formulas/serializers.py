from rest_framework import serializers

from .models import FormulaDefinition, FormulaVersion, TechDataFieldDefinition


class FormulaVersionSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.username", default=None, read_only=True)

    class Meta:
        model = FormulaVersion
        fields = ["id", "previous_expression", "new_expression", "changed_by_name", "changed_at", "note"]


class FormulaDefinitionSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source="updated_by.username", default=None, read_only=True)

    class Meta:
        model = FormulaDefinition
        fields = [
            "id",
            "key",
            "label",
            "section",
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


class FormulaPreviewRequestSerializer(serializers.Serializer):
    expression = serializers.CharField()
    variables = serializers.DictField(child=serializers.FloatField(), required=False, default=dict)


class TechDataFieldDefinitionSerializer(serializers.ModelSerializer):
    """Read/list representation — a Manual field simply has null formula-derived fields."""

    is_auto = serializers.BooleanField(read_only=True)
    is_read_only = serializers.BooleanField(read_only=True)
    formula_key = serializers.CharField(source="formula.key", read_only=True, default=None)
    expression = serializers.CharField(source="formula.expression", read_only=True, default=None)
    input_variables = serializers.JSONField(source="formula.input_variables", read_only=True, default=list)
    output_unit = serializers.CharField(source="formula.output_unit", read_only=True, default="")

    class Meta:
        model = TechDataFieldDefinition
        fields = [
            "id", "key", "label", "section", "unit", "field_type", "options",
            "is_auto", "is_catalog_derived", "is_read_only", "formula_key", "expression",
            "input_variables", "output_unit", "order", "is_core", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "key", "is_auto", "is_catalog_derived", "is_read_only", "formula_key",
            "expression", "input_variables", "output_unit", "is_core", "created_at", "updated_at",
        ]
        # `field_type` is also effectively immutable (enforced in the view rather than
        # here, since a core field's own PATCH still needs to reject it while a create
        # payload needs to set it) — see TechDataFieldDefinitionViewSet.


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

    def validate(self, data):
        if data["field_type"] == "select" and not data.get("options") and data["is_auto"] is False:
            raise serializers.ValidationError({"options": "A Manual select field needs at least one option."})
        if data["is_auto"] and not data.get("expression", "").strip():
            raise serializers.ValidationError({"expression": "Required for an Auto field."})
        return data
