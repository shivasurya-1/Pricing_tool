from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BearingCatalogViewSet,
    CostRateValueViewSet,
    HousingCatalogViewSet,
    InHouseHourRateViewSet,
    LaggingCatalogViewSet,
    LockingDeviceCatalogViewSet,
    OrganizationSettingsView,
    RawForgingRateViewSet,
    SleeveCatalogViewSet,
)

router = DefaultRouter()
router.register("cost-rates", CostRateValueViewSet, basename="cost-rate")
router.register("raw-forging-rates", RawForgingRateViewSet, basename="raw-forging-rate")
router.register("catalogs/bearings", BearingCatalogViewSet, basename="bearing-catalog")
router.register("catalogs/sleeves", SleeveCatalogViewSet, basename="sleeve-catalog")
router.register("catalogs/housings", HousingCatalogViewSet, basename="housing-catalog")
router.register("catalogs/lagging", LaggingCatalogViewSet, basename="lagging-catalog")
router.register("catalogs/locking-devices", LockingDeviceCatalogViewSet, basename="locking-device-catalog")
router.register("in-house-hours", InHouseHourRateViewSet, basename="in-house-hour-rate")

urlpatterns = router.urls + [
    path("organization-settings/", OrganizationSettingsView.as_view(), name="organization-settings"),
]
