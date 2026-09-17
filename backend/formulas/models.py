from django.conf import settings
from django.db import models


class FormulaSection(models.TextChoices):
    TECH_DATA_AUTO = "TechDataAuto", "Technical Data Sheet — Auto Fields"
    SECTION_A = "SectionA", "Pricing Section A — Raw Materials"
    SECTION_B = "SectionB", "Pricing Section B — Ancillary Parts"
    SECTION_C = "SectionC", "Pricing Section C — In-House Processing"
    SECTION_D = "SectionD", "Pricing Section D — Outsourced Processing"
    SECTION_E = "SectionE", "Pricing Section E — Packing & Shipment"
    SECTION_F = "SectionF", "Pricing Section F — Summary"


class FormulaDefinition(models.Model):
    """
    One editable, auto-calculated field in the pricing/technical-data engine.
    `key` matches the field key already used in the frontend's PulleyTechDataValues
    (e.g. "shellPlateWeight", "sectionA.a1") so the migration from hardcoded TS is
    a straight lookup, not a remodel.
    """

    key = models.SlugField(max_length=80, unique=True)
    label = models.CharField(max_length=200)
    section = models.CharField(max_length=20, choices=FormulaSection.choices)
    expression = models.TextField(help_text="Restricted arithmetic expression — see simpleeval/expr-eval grammar.")
    input_variables = models.JSONField(default=list, help_text="Variable names this expression may reference.")
    output_unit = models.CharField(max_length=20, blank=True)
    order = models.PositiveIntegerField(default=0)

    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["section", "order", "key"]

    def __str__(self) -> str:
        return f"{self.key} = {self.expression}"


class TechDataFieldType(models.TextChoices):
    TEXT = "text", "Text"
    NUMBER = "number", "Number"
    SELECT = "select", "Select"


class TechDataFieldDefinition(models.Model):
    """
    Defines one field on the pulley Technical Data Sheet (src/data/pulleyTechDataSchema.ts's
    TECH_DATA_SECTIONS, mirrored here). `formula` is null for a Manual (plain input) field
    and set for an Auto (formula-calculated) field — its FormulaDefinition.key always equals
    this field's own `key`, so there's only ever one key to keep in sync, not two.

    `is_core` distinguishes the ~70 fields backfilled from the original hardcoded schema
    (locked: can't be deleted or have `key`/`field_type` changed) from fields added later
    through the API (deletable, subject to the reference-check in the view).
    """

    key = models.SlugField(max_length=80, unique=True)
    label = models.CharField(max_length=200)
    section = models.CharField(max_length=100)
    unit = models.CharField(max_length=30, blank=True)
    field_type = models.CharField(max_length=10, choices=TechDataFieldType.choices, default=TechDataFieldType.TEXT)
    options = models.JSONField(default=list, blank=True, help_text="Only used when field_type='select' and not catalog-driven.")
    formula = models.OneToOneField(
        FormulaDefinition, null=True, blank=True, on_delete=models.SET_NULL, related_name="tech_data_field"
    )
    order = models.PositiveIntegerField(default=0, help_text="Display order within its section — not evaluation order.")
    is_core = models.BooleanField(default=False)
    is_catalog_derived = models.BooleanField(
        default=False,
        help_text=(
            "Read-only, populated by a catalog lookup when its paired designation field "
            "changes (see PRICE_FIELD_SOURCE/lookupCatalogPrice in pulleyTechDataSchema.ts) "
            "rather than a FormulaDefinition. Renders read-only like an Auto field but has "
            "no `formula` — only ever True on backfilled core fields, never settable via the "
            "create API since it requires actual catalog-key wiring in code."
        ),
    )

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section", "order", "key"]

    def __str__(self) -> str:
        return f"{self.key} ({'auto' if self.formula_id else 'manual'})"

    @property
    def is_auto(self) -> bool:
        return self.formula_id is not None

    @property
    def is_read_only(self) -> bool:
        """Whether the Technical Data Sheet should render this field as a plain editable
        input or not — true for both formula-driven and catalog-derived fields."""
        return self.is_auto or self.is_catalog_derived


class FormulaVersion(models.Model):
    """Immutable audit trail entry for every formula edit."""

    formula = models.ForeignKey(FormulaDefinition, related_name="versions", on_delete=models.CASCADE)
    previous_expression = models.TextField()
    new_expression = models.TextField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    changed_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self) -> str:
        return f"{self.formula.key} @ {self.changed_at:%Y-%m-%d %H:%M}"
