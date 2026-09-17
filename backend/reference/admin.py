from django.contrib import admin

from .models import (
    BearingCatalogEntry,
    CostRateValue,
    HousingCatalogEntry,
    InHouseHourRate,
    LaggingCatalogEntry,
    LockingDeviceCatalogEntry,
    RawForgingRate,
    SleeveCatalogEntry,
)

admin.site.register(CostRateValue, list_display=["key", "label", "category", "value", "unit"])
admin.site.register(RawForgingRate, list_display=["part", "size_band_label", "plate_rate_inr_per_kg", "end_disc_rate_inr_per_kg", "is_active_default"])
admin.site.register(BearingCatalogEntry, list_display=["designation", "bore_mm", "price_inr", "delivery_days"])
admin.site.register(SleeveCatalogEntry, list_display=["sleeve_code", "for_bearing", "price_inr"])
admin.site.register(HousingCatalogEntry, list_display=["housing_designation", "for_bearing", "price_inr"])
admin.site.register(LaggingCatalogEntry, list_display=["lagging_type", "thickness_mm", "price_inr_per_m2"])
admin.site.register(LockingDeviceCatalogEntry, list_display=["model_name", "negotiated_rate_inr"])
admin.site.register(InHouseHourRate, list_display=["cost_head", "operation", "mhr_rate", "order"])
