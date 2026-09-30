from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BearingCatalogViewSet,
    GlobalParameterViewSet,
    HousingCatalogViewSet,
    InHouseHourRateViewSet,
    LagDataViewSet,
    LaggingCatalogViewSet,
    LcdDataViewSet,
    LockingDeviceCatalogViewSet,
    LogisticsPackingRateViewSet,
    MachiningLabourRateViewSet,
    MaterialRateViewSet,
    OrganizationSettingsView,
    ReferenceDropdownFieldsView,
    ReferenceDropdownValuesView,
    ShaftForgingBandViewSet,
    ShellForgingBandViewSet,
    SleeveCatalogViewSet,
)

router = DefaultRouter()
# Cost Rate Tables page — one endpoint per section, plus its Lagging Rates table.
router.register("cost-rates/global-parameters", GlobalParameterViewSet, basename="global-parameter")
router.register("cost-rates/material-rates", MaterialRateViewSet, basename="material-rate")
router.register("cost-rates/machining-labour-rates", MachiningLabourRateViewSet, basename="machining-labour-rate")
router.register("cost-rates/logistics-packing-rates", LogisticsPackingRateViewSet, basename="logistics-packing-rate")
router.register("cost-rates/lagging-rates", LaggingCatalogViewSet, basename="lagging-rate")
# Raw Forging Prices page — Shaft and Shell tables.
router.register("raw-forging/shaft-bands", ShaftForgingBandViewSet, basename="shaft-forging-band")
router.register("raw-forging/shell-bands", ShellForgingBandViewSet, basename="shell-forging-band")
router.register("catalogs/bearings", BearingCatalogViewSet, basename="bearing-catalog")
router.register("catalogs/sleeves", SleeveCatalogViewSet, basename="sleeve-catalog")
router.register("catalogs/lag-data", LagDataViewSet, basename="lag-data")
router.register("catalogs/lcd-data", LcdDataViewSet, basename="lcd-data")
router.register("catalogs/housings", HousingCatalogViewSet, basename="housing-catalog")
router.register("catalogs/locking-devices", LockingDeviceCatalogViewSet, basename="locking-device-catalog")
router.register("in-house-hours", InHouseHourRateViewSet, basename="in-house-hour-rate")

urlpatterns = [
    # Dependent-dropdown lookups — listed before the router so they never collide with catalogs/* routes.
    path("catalogs/dropdown-fields/", ReferenceDropdownFieldsView.as_view(), name="reference-dropdown-fields"),
    path("catalogs/dropdown-values/", ReferenceDropdownValuesView.as_view(), name="reference-dropdown-values"),
] + router.urls + [
    path("organization-settings/", OrganizationSettingsView.as_view(), name="organization-settings"),
]
