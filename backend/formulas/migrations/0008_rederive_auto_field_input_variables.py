import re

from django.db import migrations

# Frozen copy of formulas.evaluator.extract_variables — migrations shouldn't import
# live app code that may change later.
_IDENTIFIER_RE = re.compile(r"(?<![\w.])[A-Za-z_][\w.]*")
_RESERVED = {"min", "max", "round", "abs", "sqrt", "pow", "iff", "PI"}


def _extract_variables(expression):
    names = []
    for name in _IDENTIFIER_RE.findall(expression or ""):
        name = name.rstrip(".")
        if name and name not in _RESERVED and name not in names:
            names.append(name)
    return names


def rederive_input_variables(apps, schema_editor):
    """Auto Technical Data Sheet fields are evaluated in an order built from their
    formula's `input_variables`, which used to be whatever the client declared — so a
    variable used in the expression but missing from the list (e.g. a hub-mass formula
    declaring only one of its three inputs) could be read before it was calculated.
    Re-derive the list from the expression itself, as the API now does on every save."""
    FormulaDefinition = apps.get_model("formulas", "FormulaDefinition")
    for formula in FormulaDefinition.objects.filter(tech_data_field__isnull=False):
        derived = _extract_variables(formula.expression)
        if derived != formula.input_variables:
            formula.input_variables = derived
            formula.save(update_fields=["input_variables"])


class Migration(migrations.Migration):
    dependencies = [
        ("formulas", "0007_section_tab"),
    ]

    operations = [
        migrations.RunPython(rederive_input_variables, migrations.RunPython.noop),
    ]
