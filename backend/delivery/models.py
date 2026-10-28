from django.db import models


class Sourcing(models.TextChoices):
    IN_HOUSE = "In-house", "In-house"
    OUTSOURCE = "Outsource", "Outsource"
    LOGISTICS = "Logistics", "Logistics"
    NONE = "—", "—"


class TotalGroup(models.TextChoices):
    """How a row counts in TOTAL CALENDAR DAYS — the workbook's
    =MAX(F28:F32)+F6+F7+F23+...: the purchased components run in parallel (only the
    longest counts), the critical-path steps are added, Phase 1 isn't counted."""

    MAX = "max", "Longest of parallel group"
    SUM = "sum", "Added"
    NONE = "none", "Not counted"


class DeliveryActivity(models.Model):
    """One row of the Delivery Schedule sheet (the client workbook's "Delivery Schedule"
    tab). Standalone — not tied to any RFQ or other sheet."""

    phase = models.CharField(max_length=120)
    label = models.CharField(max_length=200)
    sourcing = models.CharField(max_length=20, choices=Sourcing.choices, default=Sourcing.IN_HOUSE)
    std_days = models.FloatField(default=0)
    override_days = models.FloatField(null=True, blank=True, help_text="Only used when the row is Outsourced.")
    unit = models.CharField(max_length=10, default="days")
    notes = models.CharField(max_length=300, blank=True)
    total_group = models.CharField(max_length=10, choices=TotalGroup.choices, default=TotalGroup.NONE)
    order = models.PositiveIntegerField(default=0)
    # False for the workbook's own rows (fixed — only their input cells are editable);
    # True for a row added on the page, which can be renamed, re-grouped and deleted.
    is_custom = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.label


class DeliveryScheduleSettings(models.Model):
    """The sheet's own values (a single row, pk=1). The safety factor lives here rather
    than in Cost Rate Tables so the sheet has no link to any other sheet."""

    safety_factor = models.FloatField(default=1.2)

    @classmethod
    def load(cls) -> "DeliveryScheduleSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
