from django.db import migrations

from formulas.field_order import heal_tied_core_field_order
from formulas.management.commands.backfill_tech_data_fields import FIELD_ROWS


def heal(apps, schema_editor):
    """Put the Technical Data Sheet's own fields back in sheet order where their stored order
    numbers were all tied (so they showed A-Z). Sections an admin has already ordered are untouched."""
    heal_tied_core_field_order(apps.get_model("formulas", "TechDataFieldDefinition"), FIELD_ROWS)


class Migration(migrations.Migration):
    dependencies = [("formulas", "0009_drop_in_house_minute_fields")]

    operations = [migrations.RunPython(heal, migrations.RunPython.noop)]
