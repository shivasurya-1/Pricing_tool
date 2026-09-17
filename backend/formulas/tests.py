import math

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .evaluator import FormulaError, evaluate_formula
from .models import FormulaDefinition, FormulaSection, TechDataFieldDefinition

User = get_user_model()


class EvaluatorTests(TestCase):
    def test_basic_arithmetic(self):
        self.assertEqual(evaluate_formula("a + b * 2", {"a": 3, "b": 4}), 11)

    def test_pi_constant_and_pow(self):
        result = evaluate_formula("pow(x, 2) * PI", {"x": 2})
        self.assertAlmostEqual(result, 4 * math.pi)

    def test_iff_true_and_false_branches(self):
        self.assertEqual(evaluate_formula("iff(x > 0, 1, 2)", {"x": 5}), 1)
        self.assertEqual(evaluate_formula("iff(x > 0, 1, 2)", {"x": -5}), 2)

    def test_missing_variable_defaults_to_zero(self):
        # Matches the frontend's num() convention: an unfilled field reads as 0.
        self.assertEqual(evaluate_formula("a + b", {"a": 5}), 5)

    def test_division_by_zero_raises_formula_error(self):
        with self.assertRaises(FormulaError):
            evaluate_formula("a / b", {"a": 1, "b": 0})

    def test_attribute_access_is_rejected(self):
        with self.assertRaises(FormulaError):
            evaluate_formula("(1).__class__", {})

    def test_import_is_rejected(self):
        with self.assertRaises(FormulaError):
            evaluate_formula('__import__("os").system("echo pwned")', {})

    def test_dunder_bare_name_defaults_to_zero_not_the_real_module(self):
        # A bare name is resolved against our `names` dict (which defaults it to 0),
        # never against Python's real namespace — so this is harmless, unlike
        # attribute access (covered by test_attribute_access_is_rejected).
        self.assertEqual(evaluate_formula("__builtins__", {}), 0)

    def test_result_must_be_numeric(self):
        with self.assertRaises(FormulaError):
            evaluate_formula("'not a number'", {})


class FormulaApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin2", "admin2@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("sales2", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

        self.formula = FormulaDefinition.objects.create(
            key="testFormula",
            label="Test Formula",
            section=FormulaSection.SECTION_A,
            expression="a + b",
            input_variables=["a", "b"],
            output_unit="INR",
        )

    def test_anyone_authenticated_can_read(self):
        response = self.sales_client.get("/api/formulas/")
        self.assertEqual(response.status_code, 200)

    def test_only_controlling_or_admin_can_write(self):
        response = self.sales_client.patch(f"/api/formulas/{self.formula.key}/", {"expression": "a - b"}, format="json")
        self.assertEqual(response.status_code, 403)

        response = self.admin_client.patch(f"/api/formulas/{self.formula.key}/", {"expression": "a - b"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.formula.refresh_from_db()
        self.assertEqual(self.formula.expression, "a - b")

    def test_saving_creates_a_version_record(self):
        self.admin_client.patch(f"/api/formulas/{self.formula.key}/", {"expression": "a * b"}, format="json")
        self.assertEqual(self.formula.versions.count(), 1)
        version = self.formula.versions.first()
        self.assertEqual(version.previous_expression, "a + b")
        self.assertEqual(version.new_expression, "a * b")
        self.assertEqual(version.changed_by, self.admin)

    def test_invalid_expression_is_rejected_on_save(self):
        response = self.admin_client.patch(f"/api/formulas/{self.formula.key}/", {"expression": "__import__('os')"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.formula.refresh_from_db()
        self.assertEqual(self.formula.expression, "a + b")  # unchanged

    def test_preview_does_not_persist(self):
        response = self.admin_client.post(
            f"/api/formulas/{self.formula.key}/preview/",
            {"expression": "a * 100", "variables": {"a": 2, "b": 3}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["current"]["result"], 5)
        self.assertEqual(response.data["candidate"]["result"], 200)
        self.formula.refresh_from_db()
        self.assertEqual(self.formula.expression, "a + b")  # preview never saves

    def test_create_and_delete_are_not_exposed(self):
        response = self.admin_client.post("/api/formulas/", {"key": "new", "expression": "1"}, format="json")
        self.assertEqual(response.status_code, 405)
        response = self.admin_client.delete(f"/api/formulas/{self.formula.key}/")
        self.assertEqual(response.status_code, 405)


class TechDataFieldDefinitionApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin3", "admin3@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("sales3", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

        self.core_field = TechDataFieldDefinition.objects.create(
            key="shellOD", label="Shell Outer Diameter", section="2. PULLEY BODY DIMENSIONS",
            unit="mm", field_type="number", is_core=True,
        )
        self.auto_field = TechDataFieldDefinition.objects.create(
            key="shellPlateWeight", label="Shell Plate Weight", section="2. PULLEY BODY DIMENSIONS", unit="kg",
            field_type="number", is_core=True,
            formula=FormulaDefinition.objects.create(
                key="shellPlateWeight", label="Shell Plate Weight", section=FormulaSection.TECH_DATA_AUTO,
                expression="shellOD * 2", input_variables=["shellOD"], output_unit="kg",
            ),
        )

    def test_anyone_authenticated_can_list(self):
        response = self.sales_client.get("/api/formulas/tech-data-fields/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_only_controlling_or_admin_can_create(self):
        payload = {"key": "customField", "label": "Custom Field", "section": "1. PROJECT INFORMATION", "field_type": "text", "is_auto": False}
        response = self.sales_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 201)

    def test_create_manual_field(self):
        payload = {"key": "couplingWeight", "label": "Coupling Weight", "section": "2. PULLEY BODY DIMENSIONS", "unit": "kg", "field_type": "number", "is_auto": False}
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["is_auto"])
        self.assertIsNone(response.data["formula_key"])

    def test_create_auto_field_with_valid_expression(self):
        payload = {
            "key": "shellPlateWeightDoubled", "label": "Shell Plate Weight x2", "section": "2. PULLEY BODY DIMENSIONS",
            "unit": "kg", "field_type": "number", "is_auto": True,
            "expression": "shellPlateWeight * 2", "input_variables": ["shellPlateWeight"], "output_unit": "kg",
        }
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["is_auto"])
        self.assertEqual(response.data["expression"], "shellPlateWeight * 2")
        self.assertTrue(FormulaDefinition.objects.filter(key="shellPlateWeightDoubled").exists())

    def test_create_auto_field_rejects_unknown_variable(self):
        payload = {
            "key": "badField", "label": "Bad Field", "section": "2. PULLEY BODY DIMENSIONS", "field_type": "number",
            "is_auto": True, "expression": "shellPlateWieght * 2", "input_variables": ["shellPlateWieght"],
        }
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("input_variables", response.data)
        self.assertFalse(TechDataFieldDefinition.objects.filter(key="badField").exists())

    def test_create_auto_field_rejects_invalid_expression(self):
        payload = {
            "key": "badExpr", "label": "Bad Expr", "section": "2. PULLEY BODY DIMENSIONS", "field_type": "number",
            "is_auto": True, "expression": "shellOD +", "input_variables": ["shellOD"],
        }
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("expression", response.data)

    def test_duplicate_key_is_rejected(self):
        payload = {"key": "shellOD", "label": "Dup", "section": "1. PROJECT INFORMATION", "field_type": "text", "is_auto": False}
        response = self.admin_client.post("/api/formulas/tech-data-fields/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_field_type_is_immutable(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"field_type": "select"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_label_and_order_are_editable(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"label": "New Label", "order": 5}, format="json")
        self.assertEqual(response.status_code, 200)
        self.core_field.refresh_from_db()
        self.assertEqual(self.core_field.label, "New Label")
        self.assertEqual(self.core_field.order, 5)

    def test_core_field_cannot_be_deleted(self):
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{self.core_field.key}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(TechDataFieldDefinition.objects.filter(key=self.core_field.key).exists())

    def test_custom_field_referenced_by_a_formula_cannot_be_deleted(self):
        custom = TechDataFieldDefinition.objects.create(
            key="couplingWeight", label="Coupling Weight", section="2. PULLEY BODY DIMENSIONS", field_type="number",
        )
        FormulaDefinition.objects.create(
            key="couplingCost", label="Coupling Cost", section=FormulaSection.TECH_DATA_AUTO,
            expression="couplingWeight * 100", input_variables=["couplingWeight"],
        )
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{custom.key}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(TechDataFieldDefinition.objects.filter(key=custom.key).exists())

    def test_unreferenced_custom_field_can_be_deleted(self):
        custom = TechDataFieldDefinition.objects.create(
            key="scratchField", label="Scratch Field", section="1. PROJECT INFORMATION", field_type="text",
        )
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{custom.key}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TechDataFieldDefinition.objects.filter(key=custom.key).exists())

    def test_deleting_custom_auto_field_also_deletes_its_formula(self):
        custom = TechDataFieldDefinition.objects.create(
            key="scratchAuto", label="Scratch Auto", section="1. PROJECT INFORMATION", field_type="number",
            formula=FormulaDefinition.objects.create(
                key="scratchAuto", label="Scratch Auto", section=FormulaSection.TECH_DATA_AUTO, expression="1", input_variables=[],
            ),
        )
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{custom.key}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FormulaDefinition.objects.filter(key="scratchAuto").exists())


class BackfillTechDataFieldsTests(TestCase):
    def test_backfill_is_idempotent_and_links_known_formulas(self):
        from django.core.management import call_command

        call_command("seed_formulas")
        call_command("backfill_tech_data_fields")
        first_count = TechDataFieldDefinition.objects.count()
        self.assertGreater(first_count, 0)

        shell_plate_weight = TechDataFieldDefinition.objects.get(key="shellPlateWeight")
        self.assertTrue(shell_plate_weight.is_auto)
        bearing_price = TechDataFieldDefinition.objects.get(key="bearing1Price")
        self.assertTrue(bearing_price.is_catalog_derived)
        self.assertFalse(bearing_price.is_auto)

        call_command("backfill_tech_data_fields")
        self.assertEqual(TechDataFieldDefinition.objects.count(), first_count)
