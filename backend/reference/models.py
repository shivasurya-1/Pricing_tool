from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models


class ReferenceOwnedModel(models.Model):
    """Shared audit fields for every reference/master data table."""

    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


rate_key_validator = RegexValidator(
    r"^[A-Za-z_][A-Za-z0-9_]*$",
    "Key must start with a letter or underscore and contain only letters, digits and underscores "
    "(it is used as a variable name in formulas).",
)


class CostRateTableModel(ReferenceOwnedModel):
    """Shared shape of the four Cost Rate Tables sections. `key` is the variable name
    the pricing formulas read the rate under, so it is unique across all four tables
    (enforced in CostRateTableSerializer) and fixed once created."""

    key = models.CharField(max_length=80, unique=True, validators=[rate_key_validator])
    order = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True
        ordering = ["order", "key"]


class GlobalParameter(CostRateTableModel):
    """A. Global Parameters — exchange rate, GST, markup factors, etc."""

    parameter = models.CharField(max_length=200)
    value = models.FloatField()
    unit = models.CharField(max_length=30, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"{self.parameter}: {self.value} {self.unit}".strip()


class MaterialRate(CostRateTableModel):
    """B. Material Rates — INR/kg (EUR/kg optional, informational)."""

    material = models.CharField(max_length=200)
    inr_per_kg = models.FloatField()
    eur_per_kg = models.FloatField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"{self.material}: {self.inr_per_kg} INR/kg"


class MachiningLabourRate(CostRateTableModel):
    """C. Machining & Labour Rates — INR/h (EUR/h optional, informational)."""

    operation = models.CharField(max_length=200)
    inr_per_hour = models.FloatField()
    eur_per_hour = models.FloatField(null=True, blank=True)
    sourcing_default = models.CharField(max_length=60, blank=True)

    def __str__(self) -> str:
        return f"{self.operation}: {self.inr_per_hour} INR/h"


class LogisticsPackingRate(CostRateTableModel):
    """E. Logistics & Packing Rates — freight, packing, shipping."""

    item = models.CharField(max_length=200)
    rate = models.FloatField()
    unit = models.CharField(max_length=30, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"{self.item}: {self.rate} {self.unit}".strip()


FORGING_SOURCING_CHOICES = [("Outsourced", "Outsourced"), ("Inhouse", "In-house")]


class ShaftForgingBand(ReferenceOwnedModel):
    """Raw Forging Prices — Shaft table (the "Add Shaft Band" form)."""

    material = models.CharField(max_length=100, help_text="e.g. '42CrMo4+QT'")
    diameter = models.CharField(max_length=100, help_text="e.g. 'Ø 200 - 880'")
    length = models.CharField(max_length=100, help_text="e.g. '2300 - 7300'")
    sourcing = models.CharField(max_length=12, choices=FORGING_SOURCING_CHOICES, blank=True)
    as_forge_rate_inr_per_kg = models.FloatField(
        null=True, blank=True, help_text="Blank means 'As per RFQ'."
    )
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.material} — {self.diameter} x {self.length}"


class ShellForgingBand(ReferenceOwnedModel):
    """Raw Forging Prices — Shell table (the "Add Shell Band" form)."""

    sourcing = models.CharField(max_length=12, choices=FORGING_SOURCING_CHOICES, blank=True)
    diameter_body = models.CharField(max_length=100, help_text="e.g. '300 - <=500'")
    face_width_body = models.CharField(max_length=100, help_text="e.g. '800-1200'")
    wall_thickness = models.CharField(max_length=100, blank=True, help_text="Body → sheet +x mm, e.g. '10-12'")
    welded_in_plate_thickness = models.CharField(max_length=100, blank=True, help_text="e.g. '50-80'")
    t_bottom_thickness = models.CharField(max_length=100, blank=True, help_text="e.g. '100-150'")
    plate_rate_inr_per_kg = models.FloatField(null=True, blank=True)
    end_disc_hub_rate_inr_per_kg = models.FloatField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.diameter_body} x {self.face_width_body}"


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


class LagDataEntry(ReferenceOwnedModel):
    """Mirrors the workbook's LAG_DATA sheet — lagging lookup keyed by Lagging Type.
    Separate from LaggingCatalogEntry (Cost Rate Tables → Lagging Rates)."""

    lagging_type = models.CharField(max_length=100, unique=True, help_text="Lookup key, e.g. 'Rubber vulc. 12mm'")
    thickness_mm = models.FloatField()
    price_inr_per_m2 = models.FloatField()
    delivery_days = models.PositiveIntegerField()
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]
        verbose_name_plural = "lag data entries"

    def __str__(self) -> str:
        return self.lagging_type


class LcdDataEntry(ReferenceOwnedModel):
    """Mirrors the workbook's LCD_DATA sheet — locking devices keyed by Model / Size.
    Separate from LockingDeviceCatalogEntry (catalogs/locking-devices)."""

    model_size = models.CharField(max_length=100, unique=True, help_text="e.g. 'NMTG N7036-100 × 150'")
    indicative_price = models.CharField(max_length=100, blank=True, help_text="Free text range, e.g. '₹25,000 – ₹35,000'")
    negotiated_rate_inr = models.FloatField()
    remarks = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["id"]
        verbose_name_plural = "LCD data entries"

    def __str__(self) -> str:
        return self.model_size


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
    key = models.CharField(max_length=80, unique=True, validators=[rate_key_validator])
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


class OrganizationSettings(ReferenceOwnedModel):
    """Singleton — one row, forced to pk=1. Backs the Settings page's 7 tabs.
    Use `OrganizationSettings.load()` to get-or-create it rather than querying
    directly, so the first GET ever made returns sane defaults instead of 404ing."""

    CURRENCY_CHOICES = [("INR", "INR"), ("USD", "USD"), ("EUR", "EUR"), ("GBP", "GBP")]

    # Company Profile
    company_name = models.CharField(max_length=200, blank=True)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=200, blank=True)
    tax_registration_number = models.CharField(max_length=50, blank=True)
    logo_url = models.CharField(max_length=500, blank=True)

    # Currency
    default_currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default="INR")

    # Tax Settings — identity/labeling only; the rate itself lives on Cost Rate
    # Tables (GlobalParameter, key=gstRate) so there's one source of truth.
    tax_registration_label = models.CharField(max_length=50, blank=True, default="GSTIN")
    default_tax_applicability = models.CharField(max_length=200, blank=True)

    # Workflow Settings — informational SLA targets, not yet enforced/alerted.
    sla_days_operations_review = models.PositiveIntegerField(null=True, blank=True)
    sla_days_sourcing = models.PositiveIntegerField(null=True, blank=True)
    sla_days_controlling = models.PositiveIntegerField(null=True, blank=True)
    sla_days_approval = models.PositiveIntegerField(null=True, blank=True)

    # Notification Preferences — inert until outbound email is built.
    notify_on_stage_change = models.BooleanField(default=True)
    notify_email_enabled = models.BooleanField(default=False)

    # Quotation Template — feeds PDF/CSV export.
    quotation_header_text = models.TextField(blank=True)
    quotation_footer_text = models.TextField(blank=True)
    quotation_validity_days_default = models.PositiveIntegerField(null=True, blank=True)

    # Terms & Conditions
    terms_and_conditions_text = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "OrganizationSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self) -> str:
        return "Organization Settings"


class InHouseHourRate(ReferenceOwnedModel):
    """Mirrors src/data/inHouseHoursRates.ts's InHouseHourRate — the "In-House Hours"
    page's simple MHR-rate legend table (informational; not consumed by any
    calculation, unlike MachiningLabourRate's per-operation labour rates)."""

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
