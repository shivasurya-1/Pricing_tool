"""Live dropdown options for Technical Data Sheet select fields linked to a reference
catalog (Bearings, Sleeves, Housings, Lag Data, LCD Data, ...).

A field is linked through its `options_source`, saved by the Formulas page's catalog
picker as "table::label_field::value_field::picked_label" (see
src/components/reference/ReferenceCatalogPicker.tsx). Its `options` column only holds a
one-off copy taken when the catalog was picked, so new or edited catalog rows never
reached the dropdown — reading the catalog live here fixes that.
"""

from urllib.parse import unquote

from django.db.models import Q

from reference.views import REFERENCE_DROPDOWN_FIELDS


def parse_options_source(options_source: str) -> dict | None:
    """The catalog a field's options come from, or None if it isn't linked to one (a
    plain typed list, or a source that no longer matches the allowlist)."""
    parts = (options_source or "").split("::")
    if len(parts) < 2:
        return None
    table, label_field = parts[0], parts[1]
    cfg = REFERENCE_DROPDOWN_FIELDS.get(table)
    if cfg is None or cfg["label_field"]["field"] != label_field:
        return None
    allowed = [column["field"] for column in cfg["value_fields"]]
    picked_value_field = parts[2] if len(parts) > 2 else ""
    # The price shown/filled for each option: the value column picked on the Formulas
    # page if any, else the table's first value column (its INR price for every catalog).
    price_field = picked_value_field if picked_value_field in allowed else (allowed[0] if allowed else None)
    return {
        "table": table,
        "table_label": cfg["label"],
        "label_field": label_field,
        "price_field": price_field,
        "model": cfg["model"],
    }


def catalog_options(options_source: str, cache: dict | None = None) -> list[dict] | None:
    """[{label, price}] for every catalog row, in the catalog's own order, or None if the
    field isn't catalog-linked. Duplicate labels (e.g. a sleeve code listed for two
    bearings) keep their first row. `cache` (keyed by table+columns) avoids re-querying
    the same catalog for several fields in one request."""
    link = parse_options_source(options_source)
    if link is None:
        return None
    label_field, price_field = link["label_field"], link["price_field"]
    cache_key = (link["table"], label_field, price_field)
    if cache is not None and cache_key in cache:
        return cache[cache_key]

    columns = [label_field] + ([price_field] if price_field and price_field != label_field else [])
    rows = link["model"].objects.exclude(Q(**{f"{label_field}__isnull": True}) | Q(**{label_field: ""})).values(*columns)
    options, seen = [], set()
    for row in rows:
        label = str(row[label_field])
        if label in seen:
            continue
        seen.add(label)
        options.append({"label": label, "price": row.get(price_field) if price_field else None})

    if cache is not None:
        cache[cache_key] = options
    return options


def picked_catalog_label(options_source: str) -> str:
    """The row label last picked in the Formulas page's catalog picker — the
    URL-encoded 4th part of "table::label_field::value_field::picked_label"."""
    parts = (options_source or "").split("::")
    return unquote(parts[3]) if len(parts) > 3 else ""


def catalog_labels_for_value(options: list[dict], value: str) -> list[str]:
    """Labels of every catalog row whose price equals `value` — lets a fixed value saved
    as the picked row's price (the Formulas page's catalog picker resolves a pick to its
    value column) be traced back to the row's label."""
    try:
        wanted = float(value)
    except (TypeError, ValueError):
        return []
    labels = []
    for option in options:
        try:
            if option["price"] is not None and float(option["price"]) == wanted:
                labels.append(option["label"])
        except (TypeError, ValueError):
            continue
    return labels


def catalog_option_value(options: list[dict] | None, label: str) -> float | None:
    """The numeric value a catalog-linked select contributes to a calculation: the
    picked row's price (value column), or None if the label isn't in the catalog."""
    for option in options or []:
        if option["label"] == label:
            try:
                return float(option["price"]) if option["price"] is not None else None
            except (TypeError, ValueError):
                return None
    return None


def catalog_link_info(options_source: str) -> dict | None:
    """The JSON-safe part of parse_options_source() — what the API exposes as `catalog`."""
    link = parse_options_source(options_source)
    if link is None:
        return None
    return {"table": link["table"], "table_label": link["table_label"], "price_field": link["price_field"]}
