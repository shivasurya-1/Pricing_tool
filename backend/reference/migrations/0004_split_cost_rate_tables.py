"""
Splits the single CostRateValue table (one row per rate, with a `category` column)
into one table per Cost Rate Tables section, each with its own fields, and adds a
`key` to LaggingCatalogEntry. Existing rates are copied across with their keys
unchanged, so every formula that reads them keeps working.
"""

import re

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

KEY_VALIDATOR = django.core.validators.RegexValidator(
    "^[A-Za-z_][A-Za-z0-9_]*$",
    "Key must start with a letter or underscore and contain only letters, digits and underscores "
    "(it is used as a variable name in formulas).",
)

# Labour-category rows that aren't hourly (INR/kg, INR/m², INR/set) don't fit the
# new Machining & Labour table's INR/h column — they keep their unit in Global Parameters.
HOURLY_UNITS = {"INR/h", "INR/hour"}


def copy_cost_rates(apps, schema_editor):
    CostRateValue = apps.get_model("reference", "CostRateValue")
    GlobalParameter = apps.get_model("reference", "GlobalParameter")
    MaterialRate = apps.get_model("reference", "MaterialRate")
    MachiningLabourRate = apps.get_model("reference", "MachiningLabourRate")
    LogisticsPackingRate = apps.get_model("reference", "LogisticsPackingRate")

    for r in CostRateValue.objects.all().order_by("category", "order", "key"):
        common = {"key": r.key, "order": r.order, "updated_by_id": r.updated_by_id}
        if r.category == "Material":
            notes = "" if r.unit in ("", "INR/kg") else f"Unit: {r.unit}"
            MaterialRate.objects.create(material=r.label, inr_per_kg=r.value, notes=notes, **common)
        elif r.category == "Labour" and r.unit in HOURLY_UNITS:
            MachiningLabourRate.objects.create(operation=r.label, inr_per_hour=r.value, **common)
        elif r.category == "Logistics":
            LogisticsPackingRate.objects.create(item=r.label, rate=r.value, unit=r.unit, **common)
        else:
            notes = "Moved from Machining & Labour Rates (not an hourly rate)." if r.category == "Labour" else ""
            GlobalParameter.objects.create(parameter=r.label, value=r.value, unit=r.unit, notes=notes, **common)


def fill_lagging_keys(apps, schema_editor):
    LaggingCatalogEntry = apps.get_model("reference", "LaggingCatalogEntry")
    used = set()
    for entry in LaggingCatalogEntry.objects.all().order_by("id"):
        base = re.sub(r"[^0-9A-Za-z]+", "_", entry.lagging_type).strip("_").lower() or "lagging"
        if not re.match(r"[A-Za-z_]", base):
            base = f"lagging_{base}"
        key, n = base, 2
        while key in used:
            key, n = f"{base}_{n}", n + 1
        used.add(key)
        entry.key = key
        entry.save(update_fields=["key"])


def cost_rate_table(name, fields):
    return migrations.CreateModel(
        name=name,
        fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("updated_at", models.DateTimeField(auto_now=True)),
            ("key", models.CharField(max_length=80, unique=True, validators=[KEY_VALIDATOR])),
            ("order", models.PositiveIntegerField(default=0)),
            *fields,
            ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
        ],
        options={"ordering": ["order", "key"], "abstract": False},
    )


class Migration(migrations.Migration):
    dependencies = [
        ("reference", "0003_organizationsettings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        cost_rate_table("GlobalParameter", [
            ("parameter", models.CharField(max_length=200)),
            ("value", models.FloatField()),
            ("unit", models.CharField(blank=True, max_length=30)),
            ("notes", models.CharField(blank=True, max_length=255)),
        ]),
        cost_rate_table("MaterialRate", [
            ("material", models.CharField(max_length=200)),
            ("inr_per_kg", models.FloatField()),
            ("eur_per_kg", models.FloatField(blank=True, null=True)),
            ("notes", models.CharField(blank=True, max_length=255)),
        ]),
        cost_rate_table("MachiningLabourRate", [
            ("operation", models.CharField(max_length=200)),
            ("inr_per_hour", models.FloatField()),
            ("eur_per_hour", models.FloatField(blank=True, null=True)),
            ("sourcing_default", models.CharField(blank=True, max_length=60)),
        ]),
        cost_rate_table("LogisticsPackingRate", [
            ("item", models.CharField(max_length=200)),
            ("rate", models.FloatField()),
            ("unit", models.CharField(blank=True, max_length=30)),
            ("notes", models.CharField(blank=True, max_length=255)),
        ]),
        migrations.RunPython(copy_cost_rates, migrations.RunPython.noop),
        migrations.DeleteModel(name="CostRateValue"),

        migrations.AddField(
            model_name="laggingcatalogentry",
            name="key",
            field=models.CharField(max_length=80, null=True),
        ),
        migrations.RunPython(fill_lagging_keys, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="laggingcatalogentry",
            name="key",
            field=models.CharField(max_length=80, unique=True, validators=[KEY_VALIDATOR]),
        ),
    ]
