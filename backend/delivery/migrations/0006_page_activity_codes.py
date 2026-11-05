from django.db import migrations, models

# Workbook rows coded by the first version of 0004 (A1-A24 + PU1-PU5) -> the codes the page
# uses (src/data/deliverySchedule.ts ACTIVITY_CODES). Fixed here, not read from defaults.py,
# so this migration keeps doing the same thing if the defaults change later.
OLD_TO_NEW = {
    "A3": "B1", "A4": "B2", "A5": "B3", "A6": "B4", "A7": "B5", "A8": "B6", "A9": "R1", "A10": "R2",
    "A11": "H1", "A12": "H2", "A13": "H3", "A14": "H4", "A15": "H5",
    "A16": "C1", "A17": "C2", "A18": "C3", "A19": "C4",
    "A20": "L1", "A21": "L2", "A22": "F1", "A23": "F2", "A24": "F3",
}


def renames(rows: list[dict]) -> dict[str, str]:
    """old code -> new code for one sheet (live rows or a version snapshot). Only workbook rows
    are recoded; an added row already holding one of the new codes moves to the next free
    N<number>. Empty when the sheet already uses the page's codes."""
    rename = {r["code"]: OLD_TO_NEW[r["code"]] for r in rows if not r.get("is_custom") and r["code"] in OLD_TO_NEW}
    if not rename:
        return {}
    targets = set(rename.values())
    used = {r["code"] for r in rows} | targets
    n = 0
    for r in rows:
        if r.get("is_custom") and r["code"] in targets:
            n += 1
            while f"N{n}" in used:
                n += 1
            rename[r["code"]] = f"N{n}"
            used.add(f"N{n}")
    return rename


def apply(rename: dict[str, str], codes: list[str]) -> list[str]:
    return [rename.get(c, c) for c in codes]


def widen_code_column(apps, schema_editor):
    """An early version of 0004 made `code` varchar(12); the 0004 now in history (and the
    model) say 20, so an AlterField would see no change and emit no SQL. Check the real
    column instead and widen it only where it is short. SQLite doesn't enforce the length."""
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return
    DeliveryActivity = apps.get_model("delivery", "DeliveryActivity")
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT character_maximum_length FROM information_schema.columns"
            " WHERE table_schema = current_schema() AND table_name = %s AND column_name = 'code'",
            [DeliveryActivity._meta.db_table],
        )
        found = cursor.fetchone()
    new = DeliveryActivity._meta.get_field("code")
    if not found or found[0] is None or found[0] >= new.max_length:
        return
    old = models.CharField(max_length=found[0], blank=True)
    old.set_attributes_from_name("code")
    old.model = DeliveryActivity
    schema_editor.alter_field(DeliveryActivity, old, new)


def recode(apps, schema_editor):
    """Codes and links only — each row's In tick (`included`) is left as the user has it."""
    DeliveryActivity = apps.get_model("delivery", "DeliveryActivity")
    DeliveryScheduleVersion = apps.get_model("delivery", "DeliveryScheduleVersion")

    live = list(DeliveryActivity.objects.all())
    rename = renames([{"code": a.code, "is_custom": a.is_custom} for a in live])
    if rename:
        for a in live:
            a.code = rename.get(a.code, a.code)
            a.depends_on = apply(rename, a.depends_on)
        DeliveryActivity.objects.bulk_update(live, ["code", "depends_on"])

    # Saved versions too, so "Restore" doesn't bring the old codes back.
    for v in DeliveryScheduleVersion.objects.all():
        rows = v.snapshot.get("activities", [])
        rename = renames(rows)
        if not rename:
            continue
        for r in rows:
            r["code"] = rename.get(r["code"], r["code"])
            r["depends_on"] = apply(rename, r.get("depends_on", []))
        v.critical_codes = apply(rename, v.critical_codes)
        v.save(update_fields=["snapshot", "critical_codes"])


class Migration(migrations.Migration):

    dependencies = [
        ("delivery", "0005_delivery_schedule_version"),
    ]

    operations = [
        migrations.RunPython(widen_code_column, migrations.RunPython.noop),
        migrations.RunPython(recode, migrations.RunPython.noop),
    ]
