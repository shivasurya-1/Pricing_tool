from accounts.permissions import CanEditReferenceData, role_write_permission
from rest_framework import generics, viewsets

from .models import (
    BearingCatalogEntry,
    CostRateValue,
    HousingCatalogEntry,
    InHouseHourRate,
    LaggingCatalogEntry,
    LockingDeviceCatalogEntry,
    OrganizationSettings,
    RawForgingRate,
    SleeveCatalogEntry,
)
from .serializers import (
    BearingCatalogEntrySerializer,
    CostRateValueCreateSerializer,
    CostRateValueSerializer,
    HousingCatalogEntrySerializer,
    InHouseHourRateSerializer,
    LaggingCatalogEntrySerializer,
    LockingDeviceCatalogEntrySerializer,
    OrganizationSettingsSerializer,
    RawForgingRateCreateSerializer,
    RawForgingRateSerializer,
    SleeveCatalogEntrySerializer,
)


class BaseReferenceViewSet(viewsets.ModelViewSet):
    permission_classes = [CanEditReferenceData]
    http_method_names = ["get", "patch", "put", "post", "delete", "head", "options"]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class CostRateValueViewSet(BaseReferenceViewSet):
    queryset = CostRateValue.objects.all()
    serializer_class = CostRateValueSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return CostRateValueCreateSerializer
        return CostRateValueSerializer


class RawForgingRateViewSet(BaseReferenceViewSet):
    queryset = RawForgingRate.objects.all()
    serializer_class = RawForgingRateSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return RawForgingRateCreateSerializer
        return RawForgingRateSerializer


class BearingCatalogViewSet(BaseReferenceViewSet):
    queryset = BearingCatalogEntry.objects.all()
    serializer_class = BearingCatalogEntrySerializer


class SleeveCatalogViewSet(BaseReferenceViewSet):
    queryset = SleeveCatalogEntry.objects.all()
    serializer_class = SleeveCatalogEntrySerializer


class HousingCatalogViewSet(BaseReferenceViewSet):
    queryset = HousingCatalogEntry.objects.all()
    serializer_class = HousingCatalogEntrySerializer


class LaggingCatalogViewSet(BaseReferenceViewSet):
    queryset = LaggingCatalogEntry.objects.all()
    serializer_class = LaggingCatalogEntrySerializer


class LockingDeviceCatalogViewSet(BaseReferenceViewSet):
    queryset = LockingDeviceCatalogEntry.objects.all()
    serializer_class = LockingDeviceCatalogEntrySerializer


class InHouseHourRateViewSet(BaseReferenceViewSet):
    queryset = InHouseHourRate.objects.all()
    serializer_class = InHouseHourRateSerializer


class OrganizationSettingsView(generics.RetrieveUpdateAPIView):
    """Singleton — GET/PATCH only, no list. Admin-only write, any authenticated read."""

    serializer_class = OrganizationSettingsSerializer
    permission_classes = [role_write_permission(())]

    def get_object(self):
        return OrganizationSettings.load()

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
