from django.db import migrations

from delivery.defaults import DEFAULT_SAFETY_FACTOR, default_activity_rows


def seed(apps, schema_editor):
    DeliveryActivity = apps.get_model("delivery", "DeliveryActivity")
    DeliveryScheduleSettings = apps.get_model("delivery", "DeliveryScheduleSettings")
    if not DeliveryActivity.objects.exists():
        DeliveryActivity.objects.bulk_create(DeliveryActivity(**row) for row in default_activity_rows())
    DeliveryScheduleSettings.objects.get_or_create(pk=1, defaults={"safety_factor": DEFAULT_SAFETY_FACTOR})


class Migration(migrations.Migration):
    dependencies = [("delivery", "0001_initial")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
