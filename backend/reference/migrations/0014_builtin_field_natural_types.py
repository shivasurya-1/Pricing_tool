"""Built-in column overrides (MasterTableField.is_builtin) saved before type editing
existed were all stored as "text". Set each to its column's own type, so a renamed
Number column doesn't suddenly count as switched to Text."""

from django.db import migrations

# Table slug (reference.views.REFERENCE_DROPDOWN_FIELDS) -> model name.
TABLE_MODELS = {
    "bearings": "BearingCatalogEntry",
    "sleeves": "SleeveCatalogEntry",
    "housings": "HousingCatalogEntry",
    "locking-devices": "LockingDeviceCatalogEntry",
    "lag-data": "LagDataEntry",
    "lcd-data": "LcdDataEntry",
    "shaft-bands": "ShaftForgingBand",
    "shell-bands": "ShellForgingBand",
    "global-parameters": "GlobalParameter",
    "material-rates": "MaterialRate",
    "machining-labour-rates": "MachiningLabourRate",
    "logistics-packing-rates": "LogisticsPackingRate",
    "lagging-rates": "LaggingCatalogEntry",
    "in-house-hours": "InHouseHourRate",
}
NUMBER_TYPES = {
    "FloatField", "DecimalField", "IntegerField", "SmallIntegerField", "BigIntegerField",
    "PositiveIntegerField", "PositiveSmallIntegerField", "PositiveBigIntegerField",
}


def set_natural_types(apps, schema_editor):
    MasterTableField = apps.get_model("reference", "MasterTableField")
    for row in MasterTableField.objects.filter(is_builtin=True):
        model_name = TABLE_MODELS.get(row.table)
        if not model_name:
            continue
        try:
            field = apps.get_model("reference", model_name)._meta.get_field(row.key)
        except Exception:
            continue
        natural = "select" if field.choices else "number" if field.get_internal_type() in NUMBER_TYPES else "text"
        if row.field_type != natural:
            row.field_type = natural
            row.save(update_fields=["field_type"])


class Migration(migrations.Migration):
    dependencies = [("reference", "0013_master_table_fields")]

    operations = [migrations.RunPython(set_natural_types, migrations.RunPython.noop)]
