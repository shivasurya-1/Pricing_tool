from django.contrib import admin

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

admin.site.register(GlobalParameter, list_display=["key", "parameter", "value", "unit"])
admin.site.register(MaterialRate, list_display=["key", "material", "inr_per_kg", "eur_per_kg"])
admin.site.register(MachiningLabourRate, list_display=["key", "operation", "inr_per_hour", "eur_per_hour", "sourcing_default"])
admin.site.register(LogisticsPackingRate, list_display=["key", "item", "rate", "unit"])
admin.site.register(ShaftForgingBand, list_display=["material", "diameter", "length", "sourcing", "as_forge_rate_inr_per_kg"])
admin.site.register(ShellForgingBand, list_display=["sourcing", "diameter_body", "face_width_body", "plate_rate_inr_per_kg", "end_disc_hub_rate_inr_per_kg"])
admin.site.register(BearingCatalogEntry, list_display=["designation", "bore_mm", "price_inr", "delivery_days"])
admin.site.register(SleeveCatalogEntry, list_display=["sleeve_code", "for_bearing", "price_inr"])
admin.site.register(LagDataEntry, list_display=["lagging_type", "thickness_mm", "price_inr_per_m2", "delivery_days"])
admin.site.register(LcdDataEntry, list_display=["model_size", "indicative_price", "negotiated_rate_inr", "remarks"])
admin.site.register(HousingCatalogEntry, list_display=["housing_designation", "for_bearing", "price_inr"])
admin.site.register(LaggingCatalogEntry, list_display=["key", "lagging_type", "thickness_mm", "price_inr_per_m2"])
admin.site.register(LockingDeviceCatalogEntry, list_display=["model_name", "negotiated_rate_inr"])
admin.site.register(InHouseHourRate, list_display=["cost_head", "operation", "mhr_rate", "order"])
admin.site.register(OrganizationSettings, list_display=["company_name", "default_currency", "updated_at"])
