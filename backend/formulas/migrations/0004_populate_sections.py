# Seeds the new Section registry from every section value already in use, so nothing
# that already existed (the 7 fixed formula sections, plus however many distinct
# free-text tech-data-field sections) silently disappears from the new "manage
# sections" UI — see formulas/models.py::Section's docstring for why this is a plain
# registry (label match) rather than a foreign key.
#
# Also converts every existing FormulaDefinition.section value from the old fixed
# enum's short key (e.g. "SectionA") to that section's full label (e.g. "Pricing
# Section A — Raw Materials") — TechDataFieldDefinition.section already stores its
# section as a full label, and SectionViewSet's rename-cascade (views.py) only
# matches by label, so both models need to agree on that convention going forward.

from django.db import migrations
from django.utils.text import slugify

FORMULA_SECTIONS = [
    ("TechDataAuto", "Technical Data Sheet — Auto Fields"),
    ("SectionA", "Pricing Section A — Raw Materials"),
    ("SectionB", "Pricing Section B — Ancillary Parts"),
    ("SectionC", "Pricing Section C — In-House Processing"),
    ("SectionD", "Pricing Section D — Outsourced Processing"),
    ("SectionE", "Pricing Section E — Packing & Shipment"),
    ("SectionF", "Pricing Section F — Summary"),
]


def unique_key(Section, label, order):
    base = slugify(label)[:50] or f"section-{order}"
    key = base
    suffix = 1
    while Section.objects.filter(key=key).exists():
        suffix += 1
        key = f"{base}-{suffix}"[:50]
    return key


def populate_sections(apps, schema_editor):
    Section = apps.get_model("formulas", "Section")
    FormulaDefinition = apps.get_model("formulas", "FormulaDefinition")
    TechDataFieldDefinition = apps.get_model("formulas", "TechDataFieldDefinition")

    order = 0
    for key, label in FORMULA_SECTIONS:
        Section.objects.get_or_create(key=key, defaults={"label": label, "order": order})
        # Every FormulaDefinition still storing the old short key gets converted to
        # the label now, so it matches TechDataFieldDefinition's existing convention.
        FormulaDefinition.objects.filter(section=key).update(section=label)
        order += 1

    # Covers any FormulaDefinition.section value outside the 7 known ones (shouldn't
    # exist today, but keeps this migration correct if one ever does) — by this point
    # every FormulaDefinition row already uses a label, so a plain label-set works.
    known_labels = set(Section.objects.values_list("label", flat=True))
    for value in FormulaDefinition.objects.values_list("section", flat=True).distinct():
        if value and value not in known_labels:
            key = unique_key(Section, value, order)
            Section.objects.get_or_create(key=key, defaults={"label": value, "order": order})
            known_labels.add(value)
            order += 1

    # TechDataFieldDefinition.section is free text (e.g. "2. PULLEY BODY DIMENSIONS")
    # — one Section row per distinct existing label not already covered above.
    for value in TechDataFieldDefinition.objects.values_list("section", flat=True).distinct():
        if value and value not in known_labels:
            key = unique_key(Section, value, order)
            Section.objects.get_or_create(key=key, defaults={"label": value, "order": order})
            known_labels.add(value)
            order += 1


class Migration(migrations.Migration):

    dependencies = [
        ('formulas', '0003_section_alter_formuladefinition_section'),
    ]

    operations = [
        migrations.RunPython(populate_sections, migrations.RunPython.noop),
    ]
