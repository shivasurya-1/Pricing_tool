import math

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .evaluator import FormulaError, evaluate_formula
from .models import FormulaDefinition, Section, TECH_DATA_AUTO_SECTION_KEY, TECH_DATA_AUTO_SECTION_LABEL, TechDataFieldDefinition

User = get_user_model()


class EvaluatorTests(TestCase):
    def test_basic_arithmetic(self):
        self.assertEqual(evaluate_formula("a + b * 2", {"a": 3, "b": 4}), 11)

    def test_pi_constant_and_pow(self):
        result = evaluate_formula("pow(x, 2) * PI", {"x": 2})
        self.assertAlmostEqual(result, 4 * math.pi)

    def test_pow_with_huge_exponent_is_rejected_not_computed(self):
        # pow() called as a function bypassed simpleeval's own `**`-operator DoS guard
        # (MAX_POWER) entirely — this must raise instantly, not spend seconds/memory
        # computing a number with tens of millions of digits.
        with self.assertRaises(FormulaError):
            evaluate_formula("pow(x, y)", {"x": 99999999, "y": 99999999})

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
        self.controlling = User.objects.create_user("controlling2", password="controllingpass123", role="Controlling")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")
        self.controlling_client = APIClient()
        self.controlling_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.controlling).key}")
        Section.objects.get_or_create(key="test-section-b", defaults={"label": "SectionB"})

        self.formula = FormulaDefinition.objects.create(
            key="testFormula",
            label="Test Formula",
            section="SectionA",
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

    def test_controlling_can_create_a_formula(self):
        response = self.controlling_client.post(
            "/api/formulas/",
            {"key": "newFormula", "label": "New Formula", "section": "SectionB", "expression": "testFormula * 2", "input_variables": ["testFormula"], "output_unit": "INR"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(FormulaDefinition.objects.filter(key="newFormula").exists())

    def test_sales_cannot_create_a_formula(self):
        response = self.sales_client.post(
            "/api/formulas/", {"key": "newFormula", "label": "New", "section": "SectionB", "expression": "1", "input_variables": []}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_create_rejects_unknown_variable(self):
        response = self.admin_client.post(
            "/api/formulas/",
            {"key": "newFormula", "label": "New", "section": "SectionB", "expression": "totallyUnknownVar * 2", "input_variables": ["totallyUnknownVar"]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(FormulaDefinition.objects.filter(key="newFormula").exists())

    def test_create_rejects_duplicate_key(self):
        response = self.admin_client.post(
            "/api/formulas/", {"key": self.formula.key, "label": "Dup", "section": "SectionB", "expression": "1", "input_variables": []}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_delete_succeeds_when_unreferenced(self):
        response = self.admin_client.delete(f"/api/formulas/{self.formula.key}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FormulaDefinition.objects.filter(key=self.formula.key).exists())

    def test_delete_is_blocked_while_referenced_by_another_formula(self):
        FormulaDefinition.objects.create(
            key="dependent", label="Dependent", section="SectionB", expression="testFormula * 2", input_variables=["testFormula"],
        )
        response = self.admin_client.delete(f"/api/formulas/{self.formula.key}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(FormulaDefinition.objects.filter(key=self.formula.key).exists())

    def test_delete_is_blocked_while_backing_a_tech_data_field(self):
        auto_formula = FormulaDefinition.objects.create(
            key="autoField", label="Auto Field", section=TECH_DATA_AUTO_SECTION_LABEL, expression="1", input_variables=[],
        )
        TechDataFieldDefinition.objects.create(key="autoField", label="Auto Field", section="1. PROJECT INFORMATION", formula=auto_formula)
        response = self.admin_client.delete("/api/formulas/autoField/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(FormulaDefinition.objects.filter(key="autoField").exists())

    def test_delete_all_is_admin_only(self):
        response = self.controlling_client.post("/api/formulas/delete-all/", {}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(FormulaDefinition.objects.filter(key=self.formula.key).exists())

    def test_delete_all_wipes_every_formula_and_degrades_linked_fields_to_manual(self):
        auto_formula = FormulaDefinition.objects.create(
            key="autoField2", label="Auto Field 2", section=TECH_DATA_AUTO_SECTION_LABEL, expression="1", input_variables=[],
        )
        field = TechDataFieldDefinition.objects.create(key="autoField2", label="Auto Field 2", section="1. PROJECT INFORMATION", formula=auto_formula)

        response = self.admin_client.post("/api/formulas/delete-all/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FormulaDefinition.objects.count(), 0)

        field.refresh_from_db()
        self.assertIsNone(field.formula)
        self.assertFalse(field.is_auto)


class TechDataFieldDefinitionApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin3", "admin3@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("sales3", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")
        Section.objects.create(key="test-project-info", label="1. PROJECT INFORMATION", tab="tech_sheet")
        Section.objects.create(key="test-body-dims", label="2. PULLEY BODY DIMENSIONS", tab="tech_sheet")

        self.core_field = TechDataFieldDefinition.objects.create(
            key="shellOD", label="Shell Outer Diameter", section="2. PULLEY BODY DIMENSIONS",
            unit="mm", field_type="number", is_core=True,
        )
        self.auto_field = TechDataFieldDefinition.objects.create(
            key="shellPlateWeight", label="Shell Plate Weight", section="2. PULLEY BODY DIMENSIONS", unit="kg",
            field_type="number", is_core=True,
            formula=FormulaDefinition.objects.create(
                key="shellPlateWeight", label="Shell Plate Weight", section=TECH_DATA_AUTO_SECTION_LABEL,
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

    def test_manual_field_type_can_be_changed_to_select_with_options(self):
        response = self.admin_client.patch(
            f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"field_type": "select", "options": ["A", "B"]}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.core_field.refresh_from_db()
        self.assertEqual(self.core_field.field_type, "select")
        self.assertEqual(self.core_field.options, ["A", "B"])

    def test_changing_to_select_requires_options(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"field_type": "select"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("options", response.data)

    def test_changing_away_from_select_clears_options(self):
        self.core_field.field_type, self.core_field.options = "select", ["A", "B"]
        self.core_field.save()
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"field_type": "text"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.core_field.refresh_from_db()
        self.assertEqual(self.core_field.field_type, "text")
        self.assertEqual(self.core_field.options, [])

    def test_select_field_can_have_a_fixed_value_from_its_options(self):
        url = f"/api/formulas/tech-data-fields/{self.core_field.key}/"
        response = self.admin_client.patch(url, {"field_type": "select", "options": ["SNL 532", "SNL 3030"], "fixed_value": "SNL 532"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["fixed_value"], "SNL 532")

        response = self.admin_client.patch(url, {"fixed_value": "SNL 9999"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("fixed_value", response.data)

        response = self.admin_client.patch(url, {"fixed_value": ""}, format="json")
        self.assertEqual(response.status_code, 200)
        self.core_field.refresh_from_db()
        self.assertEqual(self.core_field.fixed_value, "")

    def test_number_fixed_value_must_be_numeric_and_auto_fields_cannot_have_one(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"fixed_value": "abc"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.auto_field.key}/", {"fixed_value": "5"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_auto_field_type_is_immutable(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.auto_field.key}/", {"field_type": "text"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("field_type", response.data)

    def test_only_admin_can_change_core_field_type(self):
        controlling = User.objects.create_user("controlling3", password="ctrlpass123", role="Controlling")
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=controlling).key}")
        response = client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"field_type": "text"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("field_type", response.data)

    def test_label_and_order_are_editable(self):
        response = self.admin_client.patch(f"/api/formulas/tech-data-fields/{self.core_field.key}/", {"label": "New Label", "order": 5}, format="json")
        self.assertEqual(response.status_code, 200)
        self.core_field.refresh_from_db()
        self.assertEqual(self.core_field.label, "New Label")
        self.assertEqual(self.core_field.order, 5)

    def test_core_field_cannot_be_deleted_by_non_admin(self):
        self.controlling = User.objects.create_user("controlling3", password="controllingpass123", role="Controlling")
        controlling_client = APIClient()
        controlling_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.controlling).key}")
        response = controlling_client.delete(f"/api/formulas/tech-data-fields/{self.core_field.key}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(TechDataFieldDefinition.objects.filter(key=self.core_field.key).exists())

    def test_core_field_can_be_deleted_by_admin(self):
        # self.core_field ("shellOD") is still referenced by self.auto_field's formula
        # — use an unreferenced standalone core field instead, to isolate this test to
        # just the is_core/role check, not the separate reference-blocking behavior.
        standalone_core = TechDataFieldDefinition.objects.create(
            key="standaloneCore", label="Standalone Core Field", section="1. PROJECT INFORMATION", field_type="text", is_core=True,
        )
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{standalone_core.key}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TechDataFieldDefinition.objects.filter(key=standalone_core.key).exists())

    def test_admin_deleting_a_core_auto_field_also_deletes_its_formula(self):
        formula_key = self.auto_field.formula.key
        response = self.admin_client.delete(f"/api/formulas/tech-data-fields/{self.auto_field.key}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(FormulaDefinition.objects.filter(key=formula_key).exists())

    def test_custom_field_referenced_by_a_formula_cannot_be_deleted(self):
        custom = TechDataFieldDefinition.objects.create(
            key="couplingWeight", label="Coupling Weight", section="2. PULLEY BODY DIMENSIONS", field_type="number",
        )
        FormulaDefinition.objects.create(
            key="couplingCost", label="Coupling Cost", section=TECH_DATA_AUTO_SECTION_LABEL,
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
                key="scratchAuto", label="Scratch Auto", section=TECH_DATA_AUTO_SECTION_LABEL, expression="1", input_variables=[],
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


class SectionApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("admin4", "admin4@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("sales4", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

        self.section = Section.objects.create(key="raw-materials", label="Raw Materials", order=1)

    def test_anyone_authenticated_can_list_sections(self):
        response = self.sales_client.get("/api/formulas/sections/")
        self.assertEqual(response.status_code, 200)

    def test_only_admin_or_controlling_can_create(self):
        response = self.sales_client.post("/api/formulas/sections/", {"key": "new-section", "label": "New Section"}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.admin_client.post("/api/formulas/sections/", {"key": "new-section", "label": "New Section"}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_renaming_a_section_cascades_to_formulas_and_fields(self):
        FormulaDefinition.objects.create(key="f1", label="F1", section="Raw Materials", expression="1", input_variables=[])
        TechDataFieldDefinition.objects.create(key="tf1", label="TF1", section="Raw Materials")

        response = self.admin_client.patch(f"/api/formulas/sections/{self.section.id}/", {"label": "Raw Material Inputs"}, format="json")
        self.assertEqual(response.status_code, 200)

        self.assertEqual(FormulaDefinition.objects.get(key="f1").section, "Raw Material Inputs")
        self.assertEqual(TechDataFieldDefinition.objects.get(key="tf1").section, "Raw Material Inputs")

    def test_edit_updates_label_order_and_tab_together(self):
        response = self.admin_client.patch(
            f"/api/formulas/sections/{self.section.id}/",
            {"label": "  Raw Mats  ", "order": 7, "tab": "tech_sheet"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.section.refresh_from_db()
        self.assertEqual((self.section.label, self.section.order, self.section.tab), ("Raw Mats", 7, "tech_sheet"))

    def test_edit_rejects_blank_or_duplicate_label(self):
        Section.objects.create(key="other", label="Other")
        url = f"/api/formulas/sections/{self.section.id}/"
        self.assertEqual(self.admin_client.patch(url, {"label": "   "}, format="json").status_code, 400)
        self.assertEqual(self.admin_client.patch(url, {"label": "Other"}, format="json").status_code, 400)

    def test_edit_is_forbidden_for_sales(self):
        response = self.sales_client.patch(f"/api/formulas/sections/{self.section.id}/", {"order": 3}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_built_in_auto_section_label_and_tab_are_locked_but_order_is_editable(self):
        auto, _ = Section.objects.get_or_create(
            key=TECH_DATA_AUTO_SECTION_KEY, defaults={"label": TECH_DATA_AUTO_SECTION_LABEL, "tab": "tech_sheet"}
        )
        url = f"/api/formulas/sections/{auto.id}/"
        self.assertEqual(self.admin_client.patch(url, {"label": "Renamed"}, format="json").status_code, 400)
        self.assertEqual(self.admin_client.patch(url, {"tab": "pricing_tool"}, format="json").status_code, 400)
        self.assertEqual(self.admin_client.patch(url, {"order": 42}, format="json").status_code, 200)

    def test_delete_is_blocked_while_a_formula_uses_it(self):
        FormulaDefinition.objects.create(key="f2", label="F2", section="Raw Materials", expression="1", input_variables=[])
        response = self.admin_client.delete(f"/api/formulas/sections/{self.section.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Section.objects.filter(id=self.section.id).exists())

    def test_delete_succeeds_when_unused(self):
        response = self.admin_client.delete(f"/api/formulas/sections/{self.section.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Section.objects.filter(id=self.section.id).exists())


class SheetAssignmentTests(TestCase):
    """A formula/field shows on the sheet its section's `tab` points at — the `sheet`
    value the API returns — and can only be filed under a registered section."""

    def setUp(self):
        self.admin = User.objects.create_superuser("admin5", "admin5@example.com", "adminpass123", role="Admin")
        self.client_ = APIClient()
        self.client_.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.pricing = Section.objects.create(key="custom-pricing", label="Custom Pricing", tab="pricing_tool")
        self.tech = Section.objects.create(key="custom-tech", label="Custom Tech", tab="tech_sheet")

    def _field(self, key, section):
        payload = {"key": key, "label": key, "section": section, "field_type": "number", "is_auto": False}
        return self.client_.post("/api/formulas/tech-data-fields/", payload, format="json")

    def _formula(self, key, section):
        payload = {"key": key, "label": key, "section": section, "expression": "1", "input_variables": []}
        return self.client_.post("/api/formulas/", payload, format="json")

    def test_field_in_pricing_section_is_on_pricing_sheet(self):
        response = self._field("pricingField", "Custom Pricing")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["sheet"], "pricing_tool")

    def test_field_in_tech_section_is_on_tech_sheet(self):
        response = self._field("techField", "Custom Tech")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["sheet"], "tech_sheet")

    def test_formula_sheet_follows_its_section(self):
        self.assertEqual(self._formula("pricingFormula", "Custom Pricing").data["sheet"], "pricing_tool")
        self.assertEqual(self._formula("techFormula", "Custom Tech").data["sheet"], "tech_sheet")

    def test_unregistered_section_is_rejected(self):
        self.assertEqual(self._field("strayField", "Nope").status_code, 400)
        self.assertEqual(self._formula("strayFormula", "Nope").status_code, 400)

    def test_moving_a_section_to_the_other_sheet_moves_its_rows(self):
        self._field("movingField", "Custom Pricing")
        self.client_.patch(f"/api/formulas/sections/{self.pricing.id}/", {"tab": "tech_sheet"}, format="json")
        response = self.client_.get("/api/formulas/tech-data-fields/movingField/")
        self.assertEqual(response.data["sheet"], "tech_sheet")

    def test_editing_a_field_into_an_unregistered_section_is_rejected(self):
        self._field("editField", "Custom Pricing")
        response = self.client_.patch("/api/formulas/tech-data-fields/editField/", {"section": "Nope"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client_.patch("/api/formulas/tech-data-fields/editField/", {"section": "Custom Tech"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sheet"], "tech_sheet")
