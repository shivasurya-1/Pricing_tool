from rest_framework import serializers

from .models import (
    BearingCatalogEntry,
    CostRateValue,
    HousingCatalogEntry,
    LaggingCatalogEntry,
    LockingDeviceCatalogEntry,
    RawForgingRate,
    SleeveCatalogEntry,
)


class CostRateValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostRateValue
        fields = ["id", "key", "label", "category", "value", "unit", "order"]
        read_only_fields = ["id", "key", "label", "category", "unit", "order"]


class RawForgingRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawForgingRate
        fields = [
            "id", "part", "material", "sourcing", "size_band_label",
            "plate_rate_inr_per_kg", "end_disc_rate_inr_per_kg", "is_active_default", "order",
        ]
        read_only_fields = ["id", "part", "material", "sourcing", "size_band_label", "is_active_default", "order"]


class BearingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = BearingCatalogEntry
        fields = ["id", "designation", "bore_mm", "price_inr", "price_eur", "delivery_days"]


class SleeveCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SleeveCatalogEntry
        fields = ["id", "for_bearing", "sleeve_code", "price_eur", "price_inr"]


class HousingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = HousingCatalogEntry
        fields = ["id", "for_bearing", "housing_designation", "price_inr", "delivery_days"]


class LaggingCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LaggingCatalogEntry
        fields = ["id", "lagging_type", "thickness_mm", "price_inr_per_m2", "delivery_days", "description"]


class LockingDeviceCatalogEntrySerializer(serializers.ModelSerializer):
    model = serializers.CharField(source="model_name")

    class Meta:
        model = LockingDeviceCatalogEntry
        fields = ["id", "model", "negotiated_rate_inr", "remarks"]
