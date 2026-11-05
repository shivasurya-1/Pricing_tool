from django.db import migrations

from delivery.defaults import DEFAULT_SAFETY_FACTOR, default_activity_rows


def seed(apps, schema_editor):
    DeliveryActivity = apps.get_model("delivery", "DeliveryActivity")
    DeliveryScheduleSettings = apps.get_model("delivery", "DeliveryScheduleSettings")
    if not DeliveryActivity.objects.exists():
        # The critical-path fields don't exist yet at this point in history; 0004 fills them in.
        later = {"code", "included", "depends_on"}
        DeliveryActivity.objects.bulk_create(
            DeliveryActivity(**{k: v for k, v in row.items() if k not in later}) for row in default_activity_rows()
        )
    DeliveryScheduleSettings.objects.get_or_create(pk=1, defaults={"safety_factor": DEFAULT_SAFETY_FACTOR})


class Migration(migrations.Migration):
    dependencies = [("delivery", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
