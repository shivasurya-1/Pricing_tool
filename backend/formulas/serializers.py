from rest_framework import serializers

from .models import FormulaDefinition, FormulaVersion


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
