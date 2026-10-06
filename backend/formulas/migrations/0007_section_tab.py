# Adds Section.tab (which Formulas-page tab a section is listed under). Every existing
# section defaults to "pricing_tool" except the Technical Data Sheet auto-fields one.

from django.db import migrations, models

TECH_DATA_AUTO_SECTION_KEY = "TechDataAuto"
TECH_DATA_AUTO_SECTION_LABEL = "Technical Data Sheet — Auto Fields"


def set_tech_sheet_tab(apps, schema_editor):
    Section = apps.get_model("formulas", "Section")
    Section.objects.filter(
        models.Q(key=TECH_DATA_AUTO_SECTION_KEY) | models.Q(label=TECH_DATA_AUTO_SECTION_LABEL)
    ).update(tab="tech_sheet")


class Migration(migrations.Migration):
    dependencies = [
        ("formulas", "0006_techdatafield_options_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="section",
            name="tab",
            field=models.CharField(
                choices=[("pricing_tool", "Pricing Tool Formulas"), ("tech_sheet", "Technical Sheet Formulas")],
                default="pricing_tool",
                max_length=20,
            ),
        ),
        migrations.RunPython(set_tech_sheet_tab, migrations.RunPython.noop),
    ]
