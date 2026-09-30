from rest_framework import serializers

from .models import (
    BearingCatalogEntry,
    GlobalParameter,
    HousingCatalogEntry,
    InHouseHourRate,
    LagDataEntry,
    LaggingCatalogEntry,
    LcdDataEntry,
    LockingDeviceCatalogEntry,
    LogisticsPackingRate,
    MachiningLabourRate,
    MaterialRate,
    OrganizationSettings,
    ShaftForgingBand,
    ShellForgingBand,
    SleeveCatalogEntry,
)


class CostRateTableSerializer(serializers.ModelSerializer):
    """Shared by the four Cost Rate Tables serializers. Every field is editable except
    `key`: it's the variable name formulas read the rate under, so renaming it would
    silently break every formula that references it — delete and re-add instead."""

    COST_RATE_MODELS = (GlobalParameter, MaterialRate, MachiningLabourRate, LogisticsPackingRate)

    def validate_key(self, key):
        if self.instance is not None and key != self.instance.key:
            raise serializers.ValidationError("Key cannot be changed after creation.")
        # Rates from all four tables are merged into one key -> value map for the
        # pricing formulas, so a key must be unique across all of them, not just its own.
        for model in self.COST_RATE_MODELS:
            clash = model.objects.filter(key=key)
            if self.instance is not None and isinstance(self.instance, model):
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(f"Key '{key}' is already used in {model._meta.verbose_name_plural}.")
        return key


class GlobalParameterSerializer(CostRateTableSerializer):
    class Meta:
        model = GlobalParameter
        fields = ["id", "key", "parameter", "value", "unit", "notes", "order"]
        read_only_fields = ["id"]


class MaterialRateSerializer(CostRateTableSerializer):
    class Meta:
        model = MaterialRate
        fields = ["id", "key", "material", "inr_per_kg", "eur_per_kg", "notes", "order"]
        read_only_fields = ["id"]


class MachiningLabourRateSerializer(CostRateTableSerializer):
    class Meta:
        model = MachiningLabourRate
        fields = ["id", "key", "operation", "inr_per_hour", "eur_per_hour", "sourcing_default", "order"]
        read_only_fields = ["id"]


class LogisticsPackingRateSerializer(CostRateTableSerializer):
    class Meta:
        model = LogisticsPackingRate
        fields = ["id", "key", "item", "rate", "unit", "notes", "order"]
        read_only_fields = ["id"]


class ShaftForgingBandSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShaftForgingBand
        fields = ["id", "material", "diameter", "length", "sourcing", "as_forge_rate_inr_per_kg", "order", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class ShellForgingBandSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShellForgingBand
        fields = [
            "id", "sourcing", "diameter_body", "face_width_body", "wall_thickness",
            "welded_in_plate_thickness", "t_bottom_thickness",
            "plate_rate_inr_per_kg", "end_disc_hub_rate_inr_per_kg", "order", "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class BearingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = BearingCatalogEntry
        fields = ["id", "designation", "bore_mm", "price_inr", "price_eur", "delivery_days"]


class SleeveCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SleeveCatalogEntry
        fields = ["id", "for_bearing", "sleeve_code", "price_eur", "price_inr"]


class LagDataEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LagDataEntry
        fields = ["id", "lagging_type", "thickness_mm", "price_inr_per_m2", "delivery_days", "description", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class LcdDataEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LcdDataEntry
        fields = ["id", "model_size", "indicative_price", "negotiated_rate_inr", "remarks", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class HousingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = HousingCatalogEntry
        fields = ["id", "for_bearing", "housing_designation", "price_inr", "delivery_days"]


class LaggingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LaggingCatalogEntry
        fields = ["id", "key", "lagging_type", "thickness_mm", "price_inr_per_m2", "delivery_days", "description"]


class LockingDeviceCatalogEntrySerializer(serializers.ModelSerializer):
    model = serializers.CharField(source="model_name")

    class Meta:
        model = LockingDeviceCatalogEntry
        fields = ["id", "model", "negotiated_rate_inr", "remarks"]


class InHouseHourRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InHouseHourRate
        fields = ["id", "cost_head", "operation", "cost_centre", "activity_description", "mhr_rate", "order"]


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationSettings
        fields = [
            "company_name", "address_line1", "address_line2", "city", "state", "postal_code",
            "country", "phone", "email", "website", "tax_registration_number", "logo_url",
            "default_currency",
            "tax_registration_label", "default_tax_applicability",
            "sla_days_operations_review", "sla_days_sourcing", "sla_days_controlling", "sla_days_approval",
            "notify_on_stage_change", "notify_email_enabled",
            "quotation_header_text", "quotation_footer_text", "quotation_validity_days_default",
            "terms_and_conditions_text",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
