from accounts.permissions import CanEditReferenceData, role_write_permission
from django.db.models import Q
from django.utils.text import slugify
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
# Each table has one fixed label_field (identifies a record) and optional value_fields
# that can be pulled from the same row instead. Tables sharing a group_label are nested
# under one reference field (page) in dropdown-fields; insertion order is response order.
REFERENCE_DROPDOWN_FIELDS = {
    "bearings": {
        "model": BearingCatalogEntry,
        "label": "Bearings",
        "group_label": "Bearing Data",
        "label_field": {"field": "designation", "label": "Designation"},
        "value_fields": [{"field": "price_inr", "label": "INR/piece"}, {"field": "price_eur", "label": "EUR/piece"}],
    },
    "sleeves": {
        "model": SleeveCatalogEntry,
        "label": "Sleeves",
        "group_label": "Sleeve Data",
        "label_field": {"field": "sleeve_code", "label": "Sleeve Code"},
        "value_fields": [{"field": "price_inr", "label": "INR/piece"}, {"field": "price_eur", "label": "EUR/piece"}],
    },
    "housings": {
        "model": HousingCatalogEntry,
        "label": "Housings",
        "group_label": "Housing Data",
        "label_field": {"field": "housing_designation", "label": "Housing Designation"},
        "value_fields": [{"field": "price_inr", "label": "INR/piece"}],
    },
    "lag-data": {
        "model": LagDataEntry,
        "label": "Lag Data",
        "group_label": "Lag Data",
        "label_field": {"field": "lagging_type", "label": "Lagging Type"},
        "value_fields": [{"field": "price_inr_per_m2", "label": "INR/m²"}],
    },
    "lcd-data": {
        "model": LcdDataEntry,
        "label": "LCD Data",
        "group_label": "LCD Data",
        "label_field": {"field": "model_size", "label": "Model / Size"},
        "value_fields": [
            {"field": "negotiated_rate_inr", "label": "Negotiated Rate"},
            {"field": "indicative_price", "label": "Indicative Price"},
        ],
    },
    "shaft-bands": {
        "model": ShaftForgingBand,
        "label": "Shaft",
        "group_label": "Raw Forging Prices",
        "label_field": {"field": "material", "label": "Material"},
        "value_fields": [
            {"field": "diameter", "label": "Diameter"},
            {"field": "length", "label": "Length"},
            {"field": "as_forge_rate_inr_per_kg", "label": "As-forge Rate (₹/kg)"},
            {"field": "rate_dia_410_lg_3900_inr_per_kg", "label": "Ø 410, lg 3900 (₹/kg)"},
            {"field": "rate_dia_420_800_lg_2000_inr_per_kg", "label": "Ø 420-800, lg 2000 (₹/kg)"},
        ],
    },
    "shell-bands": {
        "model": ShellForgingBand,
        "label": "Shell",
        "group_label": "Raw Forging Prices",
        "label_field": {"field": "diameter_body", "label": "Diameter Body"},
        "value_fields": [
            {"field": "face_width_body", "label": "Face Width Body"},
            {"field": "plate_rate_inr_per_kg", "label": "Plate Rate (₹/kg)"},
            {"field": "end_disc_hub_rate_inr_per_kg", "label": "End Disc / Hub Rate (₹/kg)"},
        ],
    },
    "global-parameters": {
        "model": GlobalParameter,
        "label": "Global Parameters",
        "group_label": "Cost Rate Tables",
        "label_field": {"field": "parameter", "label": "Parameter"},
        "value_fields": [{"field": "value", "label": "Value"}],
    },
    "material-rates": {
        "model": MaterialRate,
        "label": "Material Rates",
        "group_label": "Cost Rate Tables",
        "label_field": {"field": "material", "label": "Material"},
        "value_fields": [{"field": "inr_per_kg", "label": "INR/kg"}, {"field": "eur_per_kg", "label": "EUR/kg"}],
    },
    "machining-labour-rates": {
        "model": MachiningLabourRate,
        "label": "Machining & Labour Rates",
        "group_label": "Cost Rate Tables",
        "label_field": {"field": "operation", "label": "Operation"},
        "value_fields": [{"field": "inr_per_hour", "label": "INR/h"}, {"field": "eur_per_hour", "label": "EUR/h"}],
    },
    "logistics-packing-rates": {
        "model": LogisticsPackingRate,
        "label": "Logistics & Packing Rates",
        "group_label": "Cost Rate Tables",
        "label_field": {"field": "item", "label": "Item"},
        "value_fields": [{"field": "rate", "label": "Rate"}],
    },
}


class ReferenceDropdownFieldsView(APIView):
    """First dropdown — reference fields (pages), each with its tables, their fixed label
    column and the optional value columns that can be pulled instead."""

    permission_classes = [CanEditReferenceData]

    def get(self, request):
        groups = {}
        for table, cfg in REFERENCE_DROPDOWN_FIELDS.items():
            group = groups.setdefault(
                cfg["group_label"],
                {"referenceField": slugify(cfg["group_label"]), "label": cfg["group_label"], "tables": []},
            )
            group["tables"].append(
                {
                    "table": table,
                    "label": cfg["label"],
                    "labelField": dict(cfg["label_field"]),
                    "valueFields": [dict(column) for column in cfg["value_fields"]],
                }
            )
        return Response(list(groups.values()))


class ReferenceDropdownValuesView(APIView):
    """Second dropdown — one {id, label, value} entry per record with a non-empty label,
    in the table's own ordering. `value` comes from value_field on the same row, or
    equals the label when value_field is omitted (it may be null if that cell is blank)."""

    permission_classes = [CanEditReferenceData]

    def get(self, request):
        table = request.query_params.get("table", "")
        label_field = request.query_params.get("label_field", "")
        value_field = request.query_params.get("value_field") or None
        cfg = REFERENCE_DROPDOWN_FIELDS.get(table)
        if cfg is None:
            raise ValidationError({"detail": f"Unsupported table '{table}'. Allowed: {', '.join(REFERENCE_DROPDOWN_FIELDS)}."})
        if label_field != cfg["label_field"]["field"]:
            raise ValidationError(
                {"detail": f"Unsupported label_field '{label_field}' for table '{table}'. Allowed: {cfg['label_field']['field']}."}
            )
        allowed_values = [column["field"] for column in cfg["value_fields"]]
        if value_field is not None and value_field not in allowed_values:
            raise ValidationError(
                {
                    "detail": f"Unsupported value_field '{value_field}' for table '{table}'. "
                    f"Allowed: {', '.join(allowed_values) or 'none'}."
                }
            )

        value_column = value_field or label_field
        rows = (
            cfg["model"].objects.exclude(Q(**{f"{label_field}__isnull": True}) | Q(**{label_field: ""}))
            .values("id", label_field, value_column)
        )
        return Response([{"id": row["id"], "label": row[label_field], "value": row[value_column]} for row in rows])
