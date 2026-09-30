from accounts.permissions import CanEditReferenceData, role_write_permission
from django.db.models import Min, Q
from rest_framework import generics, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

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
from .serializers import (
    BearingCatalogEntrySerializer,
    GlobalParameterSerializer,
    HousingCatalogEntrySerializer,
    InHouseHourRateSerializer,
    LagDataEntrySerializer,
    LaggingCatalogEntrySerializer,
    LcdDataEntrySerializer,
    LockingDeviceCatalogEntrySerializer,
    LogisticsPackingRateSerializer,
    MachiningLabourRateSerializer,
    MaterialRateSerializer,
    OrganizationSettingsSerializer,
    ShaftForgingBandSerializer,
    ShellForgingBandSerializer,
    SleeveCatalogEntrySerializer,
)


class BaseReferenceViewSet(viewsets.ModelViewSet):
    permission_classes = [CanEditReferenceData]
    http_method_names = ["get", "patch", "put", "post", "delete", "head", "options"]

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)


class GlobalParameterViewSet(BaseReferenceViewSet):
    queryset = GlobalParameter.objects.all()
    serializer_class = GlobalParameterSerializer


class MaterialRateViewSet(BaseReferenceViewSet):
    queryset = MaterialRate.objects.all()
    serializer_class = MaterialRateSerializer


class MachiningLabourRateViewSet(BaseReferenceViewSet):
    queryset = MachiningLabourRate.objects.all()
    serializer_class = MachiningLabourRateSerializer


class LogisticsPackingRateViewSet(BaseReferenceViewSet):
    queryset = LogisticsPackingRate.objects.all()
    serializer_class = LogisticsPackingRateSerializer


class ShaftForgingBandViewSet(BaseReferenceViewSet):
    queryset = ShaftForgingBand.objects.all()
    serializer_class = ShaftForgingBandSerializer


class ShellForgingBandViewSet(BaseReferenceViewSet):
    queryset = ShellForgingBand.objects.all()
    serializer_class = ShellForgingBandSerializer


class BearingCatalogViewSet(BaseReferenceViewSet):
    queryset = BearingCatalogEntry.objects.all()
    serializer_class = BearingCatalogEntrySerializer


class SleeveCatalogViewSet(BaseReferenceViewSet):
    queryset = SleeveCatalogEntry.objects.all()
    serializer_class = SleeveCatalogEntrySerializer


class LagDataViewSet(BaseReferenceViewSet):
    queryset = LagDataEntry.objects.all()
    serializer_class = LagDataEntrySerializer


class LcdDataViewSet(BaseReferenceViewSet):
    queryset = LcdDataEntry.objects.all()
    serializer_class = LcdDataEntrySerializer


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


# Two-level dependent dropdown (catalogs/dropdown-fields → catalogs/dropdown-values).
# Explicit allowlist: request params are only ever used as keys into this mapping,
# never as model or field names, so nothing outside it can be queried.
REFERENCE_DROPDOWN_FIELDS = {
    "bearings": {"model": BearingCatalogEntry, "field": "designation", "label": "Bearing Data"},
    "sleeves": {"model": SleeveCatalogEntry, "field": "sleeve_code", "label": "Sleeve Data"},
    "lag-data": {"model": LagDataEntry, "field": "lagging_type", "label": "Lag Data"},
    "lcd-data": {"model": LcdDataEntry, "field": "model_size", "label": "LCD Data"},
    "housings": {"model": HousingCatalogEntry, "field": "housing_designation", "label": "Housing Data"},
}


class ReferenceDropdownFieldsView(APIView):
    """First dropdown — the selectable reference tables and the field each one exposes."""

    permission_classes = [CanEditReferenceData]

    def get(self, request):
        return Response(
            [{"table": table, "label": cfg["label"], "field": cfg["field"]} for table, cfg in REFERENCE_DROPDOWN_FIELDS.items()]
        )


class ReferenceDropdownValuesView(APIView):
    """Second dropdown — unique, non-empty values of the configured field for one table.
    Duplicate values (sleeve codes / housing designations aren't unique) collapse to one
    entry carrying the lowest record id."""

    permission_classes = [CanEditReferenceData]

    def get(self, request):
        table = request.query_params.get("table", "")
        field = request.query_params.get("field", "")
        cfg = REFERENCE_DROPDOWN_FIELDS.get(table)
        if cfg is None:
            raise ValidationError({"detail": f"Unsupported table '{table}'. Allowed: {', '.join(REFERENCE_DROPDOWN_FIELDS)}."})
        if field != cfg["field"]:
            raise ValidationError({"detail": f"Unsupported field '{field}' for table '{table}'. Allowed: {cfg['field']}."})

        column = cfg["field"]
        rows = (
            cfg["model"].objects.exclude(Q(**{f"{column}__isnull": True}) | Q(**{column: ""}))
            .values(column)
            .annotate(first_id=Min("id"))
            .order_by(column)
        )
        return Response([{"id": row["first_id"], "value": row[column]} for row in rows])
