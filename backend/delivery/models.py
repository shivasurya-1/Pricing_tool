from django.conf import settings
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
    # Critical-path inputs. `code` is the row's ID in other rows' "Depends on" (A1, B1, PU1, ...;
    # N1, N2... for added rows); `included` is the In tick (counts in the schedule);
    # `depends_on` is the codes it waits for.
    code = models.CharField(max_length=20, blank=True)
    included = models.BooleanField(default=True)
    depends_on = models.JSONField(default=list, blank=True)

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


class DeliveryScheduleVersion(models.Model):
    """A saved copy of the whole sheet, made on every save, reset and restore — the
    History screen lists these and "Restore" loads one back into the live sheet."""

    number = models.PositiveIntegerField(unique=True)
    version_label = models.CharField(max_length=20)
    saved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    saved_at = models.DateTimeField(auto_now_add=True)
    change_summary = models.CharField(max_length=500, blank=True)
    # {"safety_factor": 1.2, "activities": [{code, phase, label, sourcing, std_days, ...}]}
    snapshot = models.JSONField()
    total_days = models.FloatField()
    delivery_weeks = models.FloatField()
    critical_codes = models.JSONField(default=list)

    class Meta:
        ordering = ["-number"]

    def __str__(self) -> str:
        return self.version_label
