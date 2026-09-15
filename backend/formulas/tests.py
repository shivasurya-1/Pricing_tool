import math

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .evaluator import FormulaError, evaluate_formula
from .models import FormulaDefinition, FormulaSection

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
