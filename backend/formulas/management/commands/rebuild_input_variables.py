"""
One-off repair: re-derives every FormulaDefinition's stored `input_variables` from its
current expression.

The frontend orders Auto-field evaluation by that list (pulleyTechDataCalc.ts's
computeAutoFieldsDynamic). A list left stale by an older save path — e.g. a formula
edited via PATCH /api/formulas/{key}/ before that endpoint refreshed it — lets an Auto
field run before another Auto field it reads, so it (and anything copying it) shows 0.

Safe to re-run: formulas whose list already matches are left untouched.
"""

from django.core.management.base import BaseCommand

from formulas.evaluator import extract_variables
from formulas.models import FormulaDefinition


class Command(BaseCommand):
    help = "Re-derive every formula's input_variables from its expression."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only report what would change.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        changed = 0
        for formula in FormulaDefinition.objects.order_by("key"):
            derived = [v for v in extract_variables(formula.expression) if v != formula.key]
            if derived == list(formula.input_variables or []):
                continue
            changed += 1
            self.stdout.write(f"{formula.key}: {formula.input_variables} -> {derived}")
            if not dry_run:
                formula.input_variables = derived
                formula.save(update_fields=["input_variables"])

        verb = "would be updated" if dry_run else "updated"
        self.stdout.write(self.style.SUCCESS(f"{changed} formula(s) {verb}."))
