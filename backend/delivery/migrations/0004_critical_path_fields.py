from django.db import migrations, models

from delivery.defaults import DEFAULT_ACTIVITIES, DEFAULT_CODES, DEFAULT_DEPENDS_ON

CODE_BY_LABEL = {row[1]: code for row, code in zip(DEFAULT_ACTIVITIES, DEFAULT_CODES)}


def fill(apps, schema_editor):
    """Give existing rows their ID and the workbook's dependencies. Rows added on the page
    get N1, N2, ... and no dependencies (they start on day 0 until you link them)."""
    DeliveryActivity = apps.get_model("delivery", "DeliveryActivity")
    n = 0
    for a in DeliveryActivity.objects.order_by("order", "id"):
        code = CODE_BY_LABEL.get(a.label) if not a.is_custom else None
        if code:
            a.code, a.included, a.depends_on = code, code in DEFAULT_DEPENDS_ON, DEFAULT_DEPENDS_ON.get(code, [])
        else:
            n += 1
            a.code, a.included, a.depends_on = f"N{n}", True, []
        a.save(update_fields=["code", "included", "depends_on"])


class Migration(migrations.Migration):
    dependencies = [("delivery", "0003_deliveryactivity_is_custom")]

    operations = [
        migrations.AddField(model_name="deliveryactivity", name="code", field=models.CharField(blank=True, max_length=12)),
        migrations.AddField(model_name="deliveryactivity", name="included", field=models.BooleanField(default=True)),
        migrations.AddField(model_name="deliveryactivity", name="depends_on", field=models.JSONField(blank=True, default=list)),
        migrations.RunPython(fill, migrations.RunPython.noop),
    ]
