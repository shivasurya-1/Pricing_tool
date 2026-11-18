"""User-managed fields on master-data tables ("Manage Fields" / "Add Field").

A table is identified by its slug in reference.views.REFERENCE_DROPDOWN_FIELDS
(e.g. "shell-bands"). Each MasterTableField row is either:
- a user-added field, whose values live in every record's `extra` JSON (key -> value),
  fully editable and deletable; or
- an override of a built-in model column (rename / hide / type). Built-in columns are
  read by name in pricing code and formulas, so they're never deleted.

Type changes (Text <-> Number) follow one rule, for both kinds: allowed only while the
field has no data - no record holds a value for it and no Formulas field is linked to
it (type_lock_reason). A built-in Number column that can't be empty in the database
stays Number. A built-in Number column switched to Text keeps a typed number in its
column (so it still calculates) and any other text in the record's `extra[<column>]`,
shown in the column's place.

Values of user-added fields are also offered in the Formulas page's catalog picker as
value fields named "extra.<key>" (see extra_value_fields / read_value).
"""

import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import MasterDataPermission

from .models import MasterTableField

EXTRA_PREFIX = "extra."
CUSTOM_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,59}$")
# Columns every master table has that aren't data: never renamed, hidden or pulled.
BOOKKEEPING_COLUMNS = {"id", "order", "updated_by", "updated_at", "extra"}


def table_registry() -> dict:
    """Table slug -> REFERENCE_DROPDOWN_FIELDS config. Imported lazily: views imports
    serializers, which import this module."""
    from .views import REFERENCE_DROPDOWN_FIELDS

    return REFERENCE_DROPDOWN_FIELDS


def table_for_model(model) -> str | None:
    for slug, cfg in table_registry().items():
        if cfg["model"] is model:
            return slug
    return None


def builtin_columns(model) -> dict:
    """Concrete data columns of a master model, name -> Django field."""
    return {f.name: f for f in model._meta.concrete_fields if f.name not in BOOKKEEPING_COLUMNS}


def is_required_column(field) -> bool:
    """A built-in column a record can't be created without (so it can't be hidden)."""
    return not (field.blank or field.null or field.has_default())


NUMBER_COLUMN_TYPES = {
    "FloatField", "DecimalField", "IntegerField", "SmallIntegerField", "BigIntegerField",
    "PositiveIntegerField", "PositiveSmallIntegerField", "PositiveBigIntegerField",
}


def natural_type(field) -> str:
    """A built-in column's own type: "select" (fixed choices), "number" or "text"."""
    if field.choices:
        return "select"
    return "number" if field.get_internal_type() in NUMBER_COLUMN_TYPES else "text"


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def column_usage(table: str, column_key: str) -> list[str]:
    """Why a field counts as having data: records holding a value for it, and Formulas
    fields linked to it. `column_key` is a built-in column name or "extra.<key>"."""
    cfg = table_registry().get(table)
    if cfg is None:
        return []
    model = cfg["model"]
    if is_extra_field(column_key):
        key = column_key[len(EXTRA_PREFIX):]
        count = sum(1 for extra in model.objects.values_list("extra", flat=True) if not _blank((extra or {}).get(key)))
    else:
        count = sum(
            1
            for row in model.objects.values(column_key, "extra")
            if not _blank(row[column_key]) or not _blank((row["extra"] or {}).get(column_key))
        )
    reasons = []
    if count:
        reasons.append(f"{count} record{'s' if count != 1 else ''} already {'have' if count != 1 else 'has'} a value")

    from formulas.models import TechDataFieldDefinition  # formulas imports reference; keep it lazy

    linked = [
        field.label
        for field in TechDataFieldDefinition.objects.filter(options_source__startswith=f"{table}::")
        if column_key in field.options_source.split("::")[1:3]
    ]
    if linked:
        reasons.append(f"used by Formulas field{'s' if len(linked) != 1 else ''} {', '.join(repr(n) for n in linked)}")
    return reasons


def type_lock_reason(table: str, column_key: str) -> str | None:
    """Why this field's type can't be changed right now, or None if it can."""
    cfg = table_registry().get(table)
    if cfg is None:
        return "Unknown table."
    reasons = column_usage(table, column_key)
    if reasons:
        return f"Type can't change: {'; '.join(reasons)}."
    if not is_extra_field(column_key):
        field = builtin_columns(cfg["model"]).get(column_key)
        if field is None:
            return "Unknown field."
        if natural_type(field) == "select":
            return "This field has a fixed list of choices."
        if natural_type(field) == "number" and not field.null:
            return "The database requires a number for this field on every record."
    return None


def custom_fields(table: str):
    return MasterTableField.objects.filter(table=table, is_builtin=False)


def coerce_value(field: MasterTableField, raw):
    """A user-added field's value as stored: None when blank, a float for Number, one
    of the options for Select, else a string."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if field.field_type == "number":
        try:
            return float(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError(f"'{field.label}' must be a number.")
    value = str(raw).strip()
    if field.field_type == "select" and value not in field.options:
        raise serializers.ValidationError(f"'{value}' isn't one of the options for '{field.label}'.")
    return value


class ExtraFieldsSerializerMixin:
    """Adds `extra` (the record's values for its table's user-added fields) to a
    master-data ModelSerializer. A PATCH merges into the stored values, so editing one
    field never wipes the others; keys of unknown fields are rejected."""

    def get_fields(self):
        fields = super().get_fields()
        fields["extra"] = serializers.JSONField(required=False)
        return fields

    def _table(self) -> str | None:
        return table_for_model(self.Meta.model)

    def _type_overrides(self) -> dict:
        """Built-in columns whose type was changed: column -> "text" | "number"."""
        if not hasattr(self, "_type_overrides_cache"):
            overrides = {}
            table = self._table()
            if table:
                columns = builtin_columns(self.Meta.model)
                for o in MasterTableField.objects.filter(table=table, is_builtin=True):
                    column = columns.get(o.key)
                    if column is not None and o.field_type in ("text", "number") and o.field_type != natural_type(column):
                        overrides[o.key] = o.field_type
            self._type_overrides_cache = overrides
        return self._type_overrides_cache

    def to_internal_value(self, data):
        self._builtin_texts = {}
        overrides = self._type_overrides()
        if overrides and hasattr(data, "items"):
            data = dict(data.items())
            columns = builtin_columns(self.Meta.model)
            # The Add form also sends a switched-to-Text column's value under extra[column]
            # (the page itself may have coerced the column to a number); that one wins.
            if isinstance(data.get("extra"), dict):
                extra = dict(data["extra"])
                for column, field_type in overrides.items():
                    if field_type == "text" and column in extra:
                        data[column] = extra.pop(column)
                data["extra"] = extra
            for column, field_type in overrides.items():
                if column not in data:
                    continue
                raw = data[column]
                if field_type == "number":
                    # A Text column switched to Number: only plain numbers from now on.
                    if not _blank(raw):
                        try:
                            float(str(raw).strip())
                        except ValueError:
                            raise serializers.ValidationError({column: "Must be a number."})
                    continue
                # A Number column switched to Text: a number still goes in the column (and
                # calculates); anything else is kept as text in extra[column].
                if _blank(raw):
                    data[column], self._builtin_texts[column] = None, None
                    continue
                text = str(raw).strip()
                try:
                    data[column], self._builtin_texts[column] = columns[column].to_python(text), None
                except DjangoValidationError:
                    data[column], self._builtin_texts[column] = None, text
        return super().to_internal_value(data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        extra = dict(data.get("extra") or {})
        for column in builtin_columns(self.Meta.model):
            if column in extra:
                text = extra.pop(column)
                if self._type_overrides().get(column) == "text" and column in data and text is not None:
                    data[column] = text
        if "extra" in data:
            data["extra"] = extra
        return data

    def validate_extra(self, value):
        if value is None:
            value = {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be an object of field key -> value.")
        table = self._table()
        definitions = {f.key: f for f in custom_fields(table)} if table else {}
        unknown = sorted(set(value) - set(definitions))
        if unknown:
            raise serializers.ValidationError(f"Unknown field(s) for this table: {', '.join(unknown)}.")
        merged = dict(self.instance.extra or {}) if self.instance is not None else {}
        for key, raw in value.items():
            merged[key] = coerce_value(definitions[key], raw)
        return merged

    def validate(self, attrs):
        attrs = super().validate(attrs)
        texts = getattr(self, "_builtin_texts", None)
        if texts:
            extra = dict(attrs["extra"]) if "extra" in attrs else dict((self.instance.extra or {}) if self.instance else {})
            for column, text in texts.items():
                if text is None:
                    extra.pop(column, None)
                else:
                    extra[column] = text
            attrs["extra"] = extra
        table = self._table()
        if self.instance is None and table:
            extra = attrs.get("extra") or {}
            missing = [f.label for f in custom_fields(table).filter(required=True) if extra.get(f.key) in (None, "")]
            if missing:
                raise serializers.ValidationError({"extra": f"Required: {', '.join(missing)}."})
        return attrs


class MasterTableFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterTableField
        fields = ["id", "table", "key", "label", "field_type", "options", "required", "is_builtin", "hidden", "order"]
        read_only_fields = ["id", "is_builtin"]

    def validate(self, attrs):
        table = attrs.get("table", getattr(self.instance, "table", None))
        key = attrs.get("key", getattr(self.instance, "key", None))
        if self.instance is not None:
            # The key is where the values are stored; renaming it would orphan them.
            if "table" in attrs and attrs["table"] != self.instance.table:
                raise serializers.ValidationError({"table": "Can't be changed."})
            if "key" in attrs and attrs["key"] != self.instance.key:
                raise serializers.ValidationError({"key": "Can't be changed — delete the field and add a new one."})

        cfg = table_registry().get(table)
        if cfg is None:
            raise serializers.ValidationError({"table": f"Unknown table '{table}'."})
        columns = builtin_columns(cfg["model"])

        if key in columns:
            # Built-in column: label, visibility and (while it has no data) Text <-> Number.
            attrs["is_builtin"] = True
            natural = natural_type(columns[key])
            current = self.instance.field_type if self.instance is not None else natural
            requested = "select" if natural == "select" else attrs.get("field_type", current)
            if requested not in ("text", "number") and natural != "select":
                raise serializers.ValidationError({"field_type": "Use Text or Number."})
            if requested != current:
                reason = type_lock_reason(table, key)
                if reason:
                    raise serializers.ValidationError({"field_type": reason})
            attrs["field_type"], attrs["options"], attrs["required"] = requested, [], False
            if attrs.get("hidden") and is_required_column(columns[key]):
                raise serializers.ValidationError({"hidden": f"'{key}' is required for every record, so it can't be hidden."})
        else:
            if not CUSTOM_KEY_RE.match(key or ""):
                raise serializers.ValidationError(
                    {"key": "Use lowercase letters, digits and _ (starting with a letter), e.g. 'coating_type'."}
                )
            if key in BOOKKEEPING_COLUMNS:
                raise serializers.ValidationError({"key": f"'{key}' is reserved."})
            attrs["is_builtin"] = False
            field_type = attrs.get("field_type", getattr(self.instance, "field_type", "text"))
            if self.instance is not None and field_type != self.instance.field_type:
                reason = type_lock_reason(table, f"{EXTRA_PREFIX}{key}")
                if reason:
                    raise serializers.ValidationError({"field_type": reason})
            options = attrs.get("options", getattr(self.instance, "options", []))
            if not isinstance(options, list):
                raise serializers.ValidationError({"options": "Must be a list."})
            options = [str(o).strip() for o in options if str(o).strip()]
            attrs["options"] = options if field_type == "select" else []
            if field_type == "select" and not options:
                raise serializers.ValidationError({"options": "A Select field needs at least one option."})
        if "label" in attrs and not attrs["label"].strip():
            raise serializers.ValidationError({"label": "Required."})
        return attrs


class MasterTableFieldViewSet(viewsets.ModelViewSet):
    """/reference/table-fields/?table=<slug> — field definitions and built-in overrides
    of one master table. Deleting a user-added field also removes its values from every
    record; deleting a built-in override restores that column's default label."""

    serializer_class = MasterTableFieldSerializer
    permission_classes = [MasterDataPermission]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = MasterTableField.objects.all()
        table = self.request.query_params.get("table")
        return qs.filter(table=table) if table else qs

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="type-info")
    def type_info(self, request):
        """Per field of ?table=: its own type, current type, and why the type can't be
        changed (null = it can). Built-ins by column name, added fields as "extra.<key>"."""
        table = request.query_params.get("table", "")
        cfg = table_registry().get(table)
        if cfg is None:
            raise serializers.ValidationError({"table": f"Unknown table '{table}'."})
        builtin_rows = {f.key: f for f in MasterTableField.objects.filter(table=table, is_builtin=True)}
        info = {}
        for name, column in builtin_columns(cfg["model"]).items():
            natural = natural_type(column)
            row = builtin_rows.get(name)
            info[name] = {
                "natural_type": natural,
                "type": row.field_type if row is not None else natural,
                "locked_reason": type_lock_reason(table, name),
            }
        for f in custom_fields(table):
            key = f"{EXTRA_PREFIX}{f.key}"
            info[key] = {"natural_type": f.field_type, "type": f.field_type, "locked_reason": type_lock_reason(table, key)}
        return Response(info)

    def perform_destroy(self, instance):
        with transaction.atomic():
            if not instance.is_builtin:
                cfg = table_registry().get(instance.table)
                if cfg is not None:
                    model = cfg["model"]
                    changed = []
                    for record in model.objects.all():
                        if instance.key in (record.extra or {}):
                            record.extra.pop(instance.key)
                            changed.append(record)
                    model.objects.bulk_update(changed, ["extra"])
            instance.delete()


# --- Formulas page catalog picker (dropdown-fields / dropdown-values / catalog_options)


def is_extra_field(field: str | None) -> bool:
    return bool(field) and field.startswith(EXTRA_PREFIX)


def extra_value_fields(table: str) -> list[dict]:
    """The table's visible user-added fields as picker value fields."""
    return [
        {"field": f"{EXTRA_PREFIX}{f.key}", "label": f.label}
        for f in custom_fields(table).filter(hidden=False)
    ]


def builtin_labels(table: str) -> dict:
    """Renamed built-in columns: column name -> label."""
    return dict(MasterTableField.objects.filter(table=table, is_builtin=True).values_list("key", "label"))


def query_columns(columns: list[str | None]) -> list[str]:
    """DB columns to .values() for these picker columns ("extra.x" reads `extra`;
    `extra` is always included for a built-in column's text value, see read_value)."""
    out = ["extra"]
    for column in columns:
        name = "extra" if is_extra_field(column) else column
        if name and name not in out:
            out.append(name)
    return out


def read_value(row: dict, column: str):
    """A picker column's value from a .values() row (see query_columns)."""
    if is_extra_field(column):
        return (row.get("extra") or {}).get(column[len(EXTRA_PREFIX):])
    value = row.get(column)
    # A built-in Number column switched to Text keeps non-numeric text in extra[column].
    return value if value is not None else (row.get("extra") or {}).get(column)
