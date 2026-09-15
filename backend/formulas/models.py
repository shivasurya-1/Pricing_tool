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
