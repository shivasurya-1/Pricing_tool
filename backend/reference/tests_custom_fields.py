from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from formulas.catalog_options import catalog_options

from .models import BearingCatalogEntry, MasterTableField, ShellForgingBand

User = get_user_model()

FIELDS_URL = "/api/reference/table-fields/"
SHELL_URL = "/api/reference/raw-forging/shell-bands/"


class MasterTableFieldTests(TestCase):
    def setUp(self):
        admin = User.objects.create_user("mtfadmin", password="adminpass123", role="Admin")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(admin)}")
        self.shell = ShellForgingBand.objects.create(diameter_body="300 - <=500", face_width_body="800-1200", plate_rate_inr_per_kg=95.5)

    def add_field(self, **data):
        payload = {"table": "shell-bands", "key": "coating", "label": "Coating", "field_type": "text"}
        payload.update(data)
        return self.client.post(FIELDS_URL, payload, format="json")

    # --- field definitions

    def test_add_list_edit_delete_custom_field(self):
        response = self.add_field()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(response.json()["is_builtin"])
        field_id = response.json()["id"]

        listed = self.client.get(FIELDS_URL, {"table": "shell-bands"}).json()
        self.assertEqual([f["key"] for f in listed], ["coating"])
        self.assertEqual(self.client.get(FIELDS_URL, {"table": "bearings"}).json(), [])

        response = self.client.patch(f"{FIELDS_URL}{field_id}/", {"label": "Surface Coating", "field_type": "select", "options": ["Paint", "Galv"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["options"], ["Paint", "Galv"])

        self.assertEqual(self.client.delete(f"{FIELDS_URL}{field_id}/").status_code, 204)
        self.assertFalse(MasterTableField.objects.exists())

    def test_key_rules(self):
        self.assertEqual(self.add_field(key="Bad Key").status_code, 400)
        self.assertEqual(self.add_field(key="extra").status_code, 400)
        self.assertEqual(self.add_field(table="customers").status_code, 400)
        field_id = self.add_field().json()["id"]
        self.assertEqual(self.add_field().status_code, 400)  # duplicate key in the same table
        self.assertEqual(self.add_field(table="bearings").status_code, 201)  # same key, other table
        response = self.client.patch(f"{FIELDS_URL}{field_id}/", {"key": "other"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_select_needs_options(self):
        self.assertEqual(self.add_field(field_type="select", options=[]).status_code, 400)
        self.assertEqual(self.add_field(field_type="select", options=["A", " ", "B"]).json()["options"], ["A", "B"])

    def test_builtin_column_rename_and_hide(self):
        response = self.add_field(key="plate_rate_inr_per_kg", label="Plate ₹/kg", field_type="number", required=True, hidden=True)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertTrue(body["is_builtin"])
        self.assertEqual((body["field_type"], body["required"], body["hidden"]), ("number", False, True))

    def test_builtin_rename_keeps_its_own_type(self):
        # A rename alone (no field_type sent) keeps the column's own type.
        rename = lambda key, label: self.client.post(FIELDS_URL, {"table": "shell-bands", "key": key, "label": label}, format="json")  # noqa: E731
        self.assertEqual(rename("face_width_body", "Face Width").json()["field_type"], "text")
        self.assertEqual(rename("end_disc_hub_rate_inr_per_kg", "Hub Rate").json()["field_type"], "number")

    def test_required_builtin_column_cannot_be_hidden(self):
        response = self.add_field(key="diameter_body", label="Dia", hidden=True)
        self.assertEqual(response.status_code, 400)
        self.assertIn("hidden", response.json())

    def test_sales_cannot_manage_fields(self):
        sales = User.objects.create_user("mtfsales", password="salespass123", role="Sales")
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(sales)}")
        response = client.post(FIELDS_URL, {"table": "shell-bands", "key": "x", "label": "X"}, format="json")
        self.assertIn(response.status_code, (401, 403))

    # --- record values

    def test_record_values_round_trip_and_merge(self):
        self.add_field()
        self.add_field(key="thickness", label="Thickness", field_type="number")
        response = self.client.post(
            SHELL_URL,
            {"diameter_body": "500 - <=800", "face_width_body": "1200", "extra": {"coating": "Paint", "thickness": "12.5"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["extra"], {"coating": "Paint", "thickness": 12.5})
        record_id = response.json()["id"]

        # A PATCH of one field keeps the others.
        response = self.client.patch(f"{SHELL_URL}{record_id}/", {"extra": {"thickness": ""}}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["extra"], {"coating": "Paint", "thickness": None})

    def test_record_value_validation(self):
        self.add_field(key="grade", label="Grade", field_type="select", options=["A", "B"], required=True)
        self.add_field(key="weight", label="Weight", field_type="number")
        base = {"diameter_body": "1", "face_width_body": "1"}
        self.assertEqual(self.client.post(SHELL_URL, base, format="json").status_code, 400)  # required missing
        self.assertEqual(self.client.post(SHELL_URL, {**base, "extra": {"grade": "Z"}}, format="json").status_code, 400)
        self.assertEqual(self.client.post(SHELL_URL, {**base, "extra": {"grade": "A", "weight": "heavy"}}, format="json").status_code, 400)
        self.assertEqual(self.client.post(SHELL_URL, {**base, "extra": {"grade": "A", "nope": 1}}, format="json").status_code, 400)
        self.assertEqual(self.client.post(SHELL_URL, {**base, "extra": {"grade": "A"}}, format="json").status_code, 201)
        # Required applies to new records only; existing ones can still be edited.
        self.assertEqual(self.client.patch(f"{SHELL_URL}{self.shell.id}/", {"face_width_body": "900"}, format="json").status_code, 200)

    def test_deleting_field_removes_its_values(self):
        field_id = self.add_field().json()["id"]
        self.add_field(key="keep", label="Keep")
        self.client.patch(f"{SHELL_URL}{self.shell.id}/", {"extra": {"coating": "Paint", "keep": "yes"}}, format="json")
        self.client.delete(f"{FIELDS_URL}{field_id}/")
        self.shell.refresh_from_db()
        self.assertEqual(self.shell.extra, {"keep": "yes"})

    # --- Formulas page catalog picker

    def test_dropdowns_offer_custom_fields_and_renamed_labels(self):
        self.add_field(key="weight", label="Weight (kg)", field_type="number")
        self.add_field(key="hidden_one", label="Hidden", hidden=True)
        self.add_field(key="diameter_body", label="Body Ø")
        self.client.patch(f"{SHELL_URL}{self.shell.id}/", {"extra": {"weight": 420}}, format="json")

        groups = self.client.get("/api/reference/catalogs/dropdown-fields/").json()
        shell = next(t for g in groups for t in g["tables"] if t["table"] == "shell-bands")
        self.assertEqual(shell["labelField"], {"field": "diameter_body", "label": "Body Ø"})
        self.assertEqual(shell["valueFields"][-1], {"field": "extra.weight", "label": "Weight (kg)"})
        self.assertNotIn("extra.hidden_one", [f["field"] for f in shell["valueFields"]])

        response = self.client.get(
            "/api/reference/catalogs/dropdown-values/",
            {"table": "shell-bands", "label_field": "diameter_body", "value_field": "extra.weight"},
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), [{"id": self.shell.id, "label": "300 - <=500", "value": 420.0}])

        self.assertEqual(
            catalog_options("shell-bands::diameter_body::extra.weight::300%20-%20%3C%3D500"),
            [{"label": "300 - <=500", "price": 420.0}],
        )

    def test_unknown_extra_value_field_rejected_by_dropdown(self):
        response = self.client.get(
            "/api/reference/catalogs/dropdown-values/",
            {"table": "bearings", "label_field": "designation", "value_field": "extra.nope"},
        )
        self.assertEqual(response.status_code, 400)

    def test_other_tables_get_extra_too(self):
        MasterTableField.objects.create(table="bearings", key="brand", label="Brand")
        response = self.client.post(
            "/api/reference/catalogs/bearings/",
            {"designation": "X1", "bore_mm": 1, "price_inr": 1, "price_eur": 1, "delivery_days": 1, "extra": {"brand": "SKF"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(BearingCatalogEntry.objects.get(designation="X1").extra, {"brand": "SKF"})


class FieldTypeChangeTests(TestCase):
    """A field's type (Text <-> Number) can change only while it has no data."""

    def setUp(self):
        admin = User.objects.create_user("ftadmin", password="adminpass123", role="Admin")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(admin)}")
        # Has Face Width and Plate Rate; T-bottom Thickness and End Disc / Hub Rate empty.
        self.shell = ShellForgingBand.objects.create(diameter_body="300 - <=500", face_width_body="800-1200", plate_rate_inr_per_kg=95.5)

    def field(self, key, label="X", table="shell-bands", **data):
        return self.client.post(FIELDS_URL, {"table": table, "key": key, "label": label, **data}, format="json")

    def type_info(self, table="shell-bands"):
        response = self.client.get(f"{FIELDS_URL}type-info/", {"table": table})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_added_field_type_locked_once_a_record_has_a_value(self):
        field_id = self.field("grade", field_type="text").json()["id"]
        self.assertIsNone(self.type_info()["extra.grade"]["locked_reason"])
        self.assertEqual(self.client.patch(f"{FIELDS_URL}{field_id}/", {"field_type": "number"}, format="json").status_code, 200)
        self.client.patch(f"{SHELL_URL}{self.shell.id}/", {"extra": {"grade": 5}}, format="json")
        self.assertIn("1 record already has a value", self.type_info()["extra.grade"]["locked_reason"])
        response = self.client.patch(f"{FIELDS_URL}{field_id}/", {"field_type": "text"}, format="json")
        self.assertEqual(response.status_code, 400)
        # Renaming is still fine.
        self.assertEqual(self.client.patch(f"{FIELDS_URL}{field_id}/", {"label": "Grade"}, format="json").status_code, 200)

    def test_builtin_text_to_number_when_empty(self):
        self.assertIsNone(self.type_info()["t_bottom_thickness"]["locked_reason"])
        self.assertEqual(self.field("t_bottom_thickness", "T-bottom", field_type="number").status_code, 201)
        base = {"diameter_body": "1", "face_width_body": "1"}
        self.assertEqual(self.client.post(SHELL_URL, {**base, "t_bottom_thickness": "100-150"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(SHELL_URL, {**base, "t_bottom_thickness": "120"}, format="json").status_code, 201)

    def test_builtin_type_locked_when_records_have_values(self):
        info = self.type_info()
        self.assertIn("record", info["face_width_body"]["locked_reason"])
        response = self.field("face_width_body", field_type="number")
        self.assertEqual(response.status_code, 400)
        self.assertIn("field_type", response.json())

    def test_required_number_column_stays_number(self):
        # No bearings at all, but the database needs a number in every row's price.
        self.assertIn("requires a number", self.type_info("bearings")["price_inr"]["locked_reason"])
        self.assertEqual(self.field("price_inr", table="bearings", field_type="text").status_code, 400)

    def test_choice_column_type_is_fixed(self):
        self.assertEqual(self.type_info()["sourcing"]["natural_type"], "select")
        self.assertIsNotNone(self.type_info()["sourcing"]["locked_reason"])

    def test_nullable_number_column_switched_to_text(self):
        self.assertEqual(self.field("end_disc_hub_rate_inr_per_kg", "Hub Rate", field_type="text").status_code, 201)
        base = {"diameter_body": "1", "face_width_body": "1"}
        response = self.client.post(SHELL_URL, {**base, "end_disc_hub_rate_inr_per_kg": "Rs 120 - 140"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["end_disc_hub_rate_inr_per_kg"], "Rs 120 - 140")
        self.assertEqual(response.json()["extra"], {})
        record = ShellForgingBand.objects.get(id=response.json()["id"])
        self.assertIsNone(record.end_disc_hub_rate_inr_per_kg)  # text doesn't calculate
        # A plain number still lands in the column, and replaces the text.
        response = self.client.patch(f"{SHELL_URL}{record.id}/", {"end_disc_hub_rate_inr_per_kg": "130"}, format="json")
        self.assertEqual(response.json()["end_disc_hub_rate_inr_per_kg"], 130.0)
        record.refresh_from_db()
        self.assertEqual((record.end_disc_hub_rate_inr_per_kg, record.extra), (130.0, {}))
        # The Add form's copy under extra[column] wins over a page-coerced column value.
        response = self.client.post(
            SHELL_URL, {**base, "end_disc_hub_rate_inr_per_kg": None, "extra": {"end_disc_hub_rate_inr_per_kg": "Rs 1"}}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["end_disc_hub_rate_inr_per_kg"], "Rs 1")
        # The Formulas picker shows the text too.
        self.client.patch(f"{SHELL_URL}{record.id}/", {"end_disc_hub_rate_inr_per_kg": "On request"}, format="json")
        values = self.client.get(
            "/api/reference/catalogs/dropdown-values/",
            {"table": "shell-bands", "label_field": "diameter_body", "value_field": "end_disc_hub_rate_inr_per_kg"},
        ).json()
        self.assertIn("On request", [v["value"] for v in values])
        # Now it has data, so it can't go back to Number.
        self.assertIsNotNone(self.type_info()["end_disc_hub_rate_inr_per_kg"]["locked_reason"])

    def test_formulas_link_locks_the_type(self):
        from formulas.models import TechDataFieldDefinition

        TechDataFieldDefinition.objects.create(
            key="hubRatePick", label="Hub Rate Pick", section="A", field_type="select",
            options_source="shell-bands::diameter_body::end_disc_hub_rate_inr_per_kg::",
        )
        reason = self.type_info()["end_disc_hub_rate_inr_per_kg"]["locked_reason"]
        self.assertIn("Hub Rate Pick", reason)
        self.assertEqual(self.field("end_disc_hub_rate_inr_per_kg", field_type="text").status_code, 400)
