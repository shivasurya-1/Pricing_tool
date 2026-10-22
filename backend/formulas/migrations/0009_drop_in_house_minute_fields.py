from django.db import migrations

IN_HOUSE_CODES = ("c1", "c2", "c3", "c4", "c5", "c6", "c7")


def drop_run_setup_minute_fields(apps, schema_editor):
    """Run and setup minutes differ per pulley and are entered on the In-House Hours page,
    which supplies them to formulas as variables (c1RunMin, c1SetupMin, ...) — see
    formulas.views.IN_HOUSE_HOURS_VARIABLES. So they're no longer Technical Data Sheet
    fields, nor fixed pricing formulas with those keys (e.g. c1RunMin = 390, which gave
    every RFQ item the same hours). Formulas that read these keys keep working, now
    against the page's values; their defaults were moved by reference.0011."""
    FormulaDefinition = apps.get_model("formulas", "FormulaDefinition")
    TechDataFieldDefinition = apps.get_model("formulas", "TechDataFieldDefinition")
    Section = apps.get_model("formulas", "Section")

    keys = [f"{code}{suffix}" for code in IN_HOUSE_CODES for suffix in ("RunMin", "SetupMin")]
    TechDataFieldDefinition.objects.filter(key__in=keys, formula__isnull=True).delete()
    FormulaDefinition.objects.filter(key__in=keys, tech_data_field__isnull=True).delete()

    for section in Section.objects.all():
        if "IN-HOUSE PROCESSING HOURS" not in section.label.upper():
            continue
        in_use = (
            TechDataFieldDefinition.objects.filter(section=section.label).exists()
            or FormulaDefinition.objects.filter(section=section.label).exists()
        )
        if not in_use:
            section.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("formulas", "0008_rederive_auto_field_input_variables"),
        # Copies the old fields' default minutes onto the In-House Hours rows first.
        ("reference", "0011_inhousehourrate_default_minutes"),
    ]

    operations = [
        migrations.RunPython(drop_run_setup_minute_fields, migrations.RunPython.noop),
    ]
