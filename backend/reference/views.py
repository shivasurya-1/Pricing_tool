from accounts.permissions import CanEditReferenceData
from rest_framework import viewsets

from .models import (
    BearingCatalogEntry,
    CostRateValue,
    HousingCatalogEntry,
    LaggingCatalogEntry,
    LockingDeviceCatalogEntry,
    RawForgingRate,
    SleeveCatalogEntry,
)
from .serializers import (
    BearingCatalogEntrySerializer,
    CostRateValueSerializer,
    HousingCatalogEntrySerializer,
    LaggingCatalogEntrySerializer,
    LockingDeviceCatalogEntrySerializer,
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
    http_method_names = ["get", "patch", "put", "head", "options"]  # values are seeded, not created/deleted via API


class RawForgingRateViewSet(BaseReferenceViewSet):
    queryset = RawForgingRate.objects.all()
    serializer_class = RawForgingRateSerializer
    http_method_names = ["get", "patch", "put", "head", "options"]


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
