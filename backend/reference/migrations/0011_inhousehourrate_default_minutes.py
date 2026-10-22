import re

from django.db import migrations, models

_NUMBER = re.compile(r"^\s*-?\d+(\.\d+)?\s*$")


def carry_over_default_minutes(apps, schema_editor):
    """The default minutes used to live on the Technical Data Sheet's c#RunMin / c#SetupMin
    fields (their fixed value) or, on a customised sheet, in fixed pricing formulas with
    those keys (e.g. c1RunMin = 390). Both are removed by formulas.0009, so their numbers
    move onto the In-House Hours row for that operation first."""
    InHouseHourRate = apps.get_model("reference", "InHouseHourRate")
    TechDataFieldDefinition = apps.get_model("formulas", "TechDataFieldDefinition")
    FormulaDefinition = apps.get_model("formulas", "FormulaDefinition")

    def old_default(key):
        field = TechDataFieldDefinition.objects.filter(key=key, formula__isnull=True).first()
        if field and _NUMBER.match(field.fixed_value or ""):
            return float(field.fixed_value)
        formula = FormulaDefinition.objects.filter(key=key).first()
        if formula and _NUMBER.match(formula.expression or ""):
            return float(formula.expression)
        return None

    for row in InHouseHourRate.objects.exclude(operation_code=None):
        run, setup = old_default(f"{row.operation_code}RunMin"), old_default(f"{row.operation_code}SetupMin")
        if run is None and setup is None:
            continue
        row.default_run_min = run or 0
        row.default_setup_min = setup or 0
        row.save(update_fields=["default_run_min", "default_setup_min"])


class Migration(migrations.Migration):

    dependencies = [
        ('reference', '0010_inhousehourrate_operation_code'),
        ('formulas', '0008_rederive_auto_field_input_variables'),
    ]

    operations = [
        migrations.AddField(
            model_name='inhousehourrate',
            name='default_run_min',
            field=models.FloatField(default=0, help_text='Run minutes a model gets until its own are entered.'),
        ),
        migrations.AddField(
            model_name='inhousehourrate',
            name='default_setup_min',
            field=models.FloatField(default=0, help_text='Setup minutes a model gets until its own are entered.'),
        ),
        migrations.RunPython(carry_over_default_minutes, migrations.RunPython.noop),
    ]
