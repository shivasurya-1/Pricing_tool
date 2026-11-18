"""Keeps the Technical Data Sheet's field order right.

The sheet's own order (sections 1-8, each section's fields top to bottom) is written down in
FIELD_ROWS in management/commands/backfill_tech_data_fields.py. That command numbers each section's
fields 0, 1, 2... from it, but a database filled any other way can end up with every `order` equal,
and then the API hands the fields over A-Z by key.
"""


def heal_tied_core_field_order(field_model, field_rows) -> int:
    """Renumber the sheet's own fields into sheet order, section by section, but ONLY in a section
    where their stored `order` values are tied. A section whose core fields already have distinct
    numbers is left alone, because an admin may have arranged it on purpose (`order` is editable).

    Fields added later (not in `field_rows`) keep their relative order and move to the end of the
    section. Returns how many rows changed."""
    wanted: dict[str, list[str]] = {}
    for key, _label, section, *_rest in field_rows:
        wanted.setdefault(section, []).append(key)

    changed = 0
    for section, keys in wanted.items():
        core = {f.key: f for f in field_model.objects.filter(section=section, key__in=keys)}
        orders = [f.order for f in core.values()]
        if len(core) < 2 or len(set(orders)) == len(orders):
            continue
        position = 0
        ordered = [core[k] for k in keys if k in core]
        ordered += list(field_model.objects.filter(section=section).exclude(key__in=keys).order_by("order", "id"))
        for field in ordered:
            if field.order != position:
                field.order = position
                field.save(update_fields=["order"])
                changed += 1
            position += 1
    return changed
