from django.conf import settings
from django.db import models


class ReferenceOwnedModel(models.Model):
    """Shared audit fields for every reference/master data table."""

    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CostRateCategory(models.TextChoices):
    GLOBAL = "Global", "Global Parameters"
    MATERIAL = "Material", "Material Rates"
    LABOUR = "Labour", "Machining & Labour Rates"
    LOGISTICS = "Logistics", "Logistics & Packing Rates"


class CostRateValue(ReferenceOwnedModel):
    """Replaces pulleyCostRates.ts — one row per named rate/parameter."""

    key = models.SlugField(max_length=80, unique=True)
    label = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CostRateCategory.choices)
    value = models.FloatField()
    unit = models.CharField(max_length=30, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["category", "order", "key"]

    def __str__(self) -> str:
        return f"{self.label}: {self.value} {self.unit}".strip()


class RawForgingRate(ReferenceOwnedModel):
    """Mirrors the Raw Forging Prices tab's shaft/shell size-band rows."""

    PART_CHOICES = [("shaft", "Shaft"), ("shell", "Shell")]
    SOURCING_CHOICES = [("Outsourced", "Outsourced"), ("Inhouse", "In-house")]

    part = models.CharField(max_length=10, choices=PART_CHOICES)
    material = models.CharField(max_length=100, blank=True)
    sourcing = models.CharField(max_length=12, choices=SOURCING_CHOICES, blank=True)
    size_band_label = models.CharField(max_length=100, help_text="e.g. 'Ø 80 - 180' or '>550 - 1000'")
    plate_rate_inr_per_kg = models.FloatField(null=True, blank=True)
    end_disc_rate_inr_per_kg = models.FloatField(null=True, blank=True)
    is_active_default = models.BooleanField(default=False, help_text="The row Pricing Tool actually reads today.")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["part", "order"]

    def __str__(self) -> str:
        return f"{self.part} — {self.size_band_label}"


class BearingCatalogEntry(ReferenceOwnedModel):
    designation = models.CharField(max_length=60, unique=True)
    bore_mm = models.FloatField()
    price_inr = models.FloatField()
    price_eur = models.FloatField()
    delivery_days = models.PositiveIntegerField()

    class Meta:
        ordering = ["bore_mm", "designation"]

    def __str__(self) -> str:
        return self.designation


class SleeveCatalogEntry(ReferenceOwnedModel):
    for_bearing = models.CharField(max_length=60, blank=True)
    sleeve_code = models.CharField(max_length=60)
    price_eur = models.FloatField()
    price_inr = models.FloatField()

    class Meta:
        ordering = ["sleeve_code"]

    def __str__(self) -> str:
        return self.sleeve_code


class HousingCatalogEntry(ReferenceOwnedModel):
    for_bearing = models.CharField(max_length=60, blank=True)
    housing_designation = models.CharField(max_length=60)
    price_inr = models.FloatField()
    delivery_days = models.PositiveIntegerField()

    class Meta:
        ordering = ["housing_designation"]

    def __str__(self) -> str:
        return self.housing_designation


class LaggingCatalogEntry(ReferenceOwnedModel):
    lagging_type = models.CharField(max_length=60)
    thickness_mm = models.FloatField()
    price_inr_per_m2 = models.FloatField()
    delivery_days = models.PositiveIntegerField()
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["lagging_type", "thickness_mm"]

    def __str__(self) -> str:
        return f"{self.lagging_type} ({self.thickness_mm}mm)"


class LockingDeviceCatalogEntry(ReferenceOwnedModel):
    model_name = models.CharField(max_length=60, db_column="model")
    negotiated_rate_inr = models.FloatField()
    remarks = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["model_name"]

    def __str__(self) -> str:
        return self.model_name


class InHouseHourRate(ReferenceOwnedModel):
    """Mirrors src/data/inHouseHoursRates.ts's InHouseHourRate — the "In-House Hours"
    page's simple MHR-rate legend table (informational; not consumed by any
    calculation, unlike CostRateValue's per-operation labour rates)."""

    cost_head = models.CharField(max_length=100)
    operation = models.CharField(max_length=150)
    cost_centre = models.CharField(max_length=30, blank=True)
    activity_description = models.CharField(max_length=150)
    mhr_rate = models.FloatField()
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "cost_head"]

    def __str__(self) -> str:
        return f"{self.cost_head}: {self.mhr_rate}"
