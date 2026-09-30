from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import (
    BearingCatalogEntry,
    GlobalParameter,
    HousingCatalogEntry,
    InHouseHourRate,
    LagDataEntry,
    LcdDataEntry,
    MaterialRate,
    OrganizationSettings,
    SleeveCatalogEntry,
)

User = get_user_model()


class ReferenceApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("refadmin", "refadmin@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("refsales", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

        self.rate = GlobalParameter.objects.create(key="testRate", parameter="Test Rate", value=5, unit="INR")

    # ---- Cost Rate Tables ----------------------------------------------------------

    COST_RATE_ENDPOINTS = {
        "global-parameters": {"key": "newGlobal", "parameter": "New Param", "value": 1, "unit": "%", "notes": ""},
        "material-rates": {"key": "newMaterial", "material": "Steel", "inr_per_kg": 80, "eur_per_kg": 0.7, "notes": ""},
        "machining-labour-rates": {"key": "newLabour", "operation": "Drilling", "inr_per_hour": 500, "eur_per_hour": None, "sourcing_default": "Inhouse"},
        "logistics-packing-rates": {"key": "newLogistics", "item": "Pallet", "rate": 300, "unit": "INR/pc", "notes": ""},
        "lagging-rates": {"key": "new_lagging", "lagging_type": "Test lagging", "thickness_mm": 5, "price_inr_per_m2": 100, "delivery_days": 3, "description": ""},
    }

    def test_cost_rate_tables_full_crud(self):
        for path, payload in self.COST_RATE_ENDPOINTS.items():
            with self.subTest(table=path):
                url = f"/api/reference/cost-rates/{path}/"
                created = self.admin_client.post(url, payload, format="json")
                self.assertEqual(created.status_code, 201, created.data)
                row_id = created.data["id"]
                self.assertEqual(self.sales_client.get(url).status_code, 200)
                self.assertEqual(self.sales_client.get(f"{url}{row_id}/").data["key"], payload["key"])
                text_field = next(f for f in ("parameter", "material", "operation", "item", "lagging_type") if f in payload)
                updated = self.admin_client.patch(f"{url}{row_id}/", {text_field: "Renamed"}, format="json")
                self.assertEqual(updated.status_code, 200, updated.data)
                self.assertEqual(updated.data[text_field], "Renamed")
                self.assertEqual(self.admin_client.delete(f"{url}{row_id}/").status_code, 204)
                self.assertEqual(self.admin_client.get(f"{url}{row_id}/").status_code, 404)

    def test_only_controlling_or_admin_can_write_cost_rates(self):
        payload = self.COST_RATE_ENDPOINTS["global-parameters"]
        response = self.sales_client.post("/api/reference/cost-rates/global-parameters/", payload, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.sales_client.patch(f"/api/reference/cost-rates/global-parameters/{self.rate.id}/", {"value": 1}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_cost_rate_key_is_unique_across_tables(self):
        payload = {**self.COST_RATE_ENDPOINTS["material-rates"], "key": "testRate"}
        response = self.admin_client.post("/api/reference/cost-rates/material-rates/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("key", response.data)
        self.assertFalse(MaterialRate.objects.filter(key="testRate").exists())

    def test_cost_rate_key_cannot_be_changed(self):
        response = self.admin_client.patch(f"/api/reference/cost-rates/global-parameters/{self.rate.id}/", {"key": "renamed"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.rate.refresh_from_db()
        self.assertEqual(self.rate.key, "testRate")

    def test_cost_rate_key_must_be_a_formula_identifier(self):
        payload = {**self.COST_RATE_ENDPOINTS["global-parameters"], "key": "bad-key"}
        response = self.admin_client.post("/api/reference/cost-rates/global-parameters/", payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_old_cost_rate_and_lagging_urls_are_gone(self):
        self.assertEqual(self.admin_client.get("/api/reference/cost-rates/").status_code, 404)
        self.assertEqual(self.admin_client.get("/api/reference/catalogs/lagging/").status_code, 404)

    # ---- Raw Forging Prices (Shaft / Shell bands) ---------------------------------

    FORGING_ENDPOINTS = {
        "shaft-bands": (
            {"material": "42CrMo4+QT", "diameter": "Ø 200 - 880", "length": "2300 - 7300", "sourcing": "Inhouse", "as_forge_rate_inr_per_kg": 210},
            {"as_forge_rate_inr_per_kg": None},
        ),
        "shell-bands": (
            {
                "sourcing": "Outsourced", "diameter_body": "300 - <=500", "face_width_body": "800-1200",
                "wall_thickness": "10-12", "welded_in_plate_thickness": "50-80", "t_bottom_thickness": "100-150",
                "plate_rate_inr_per_kg": 110, "end_disc_hub_rate_inr_per_kg": 210,
            },
            {"plate_rate_inr_per_kg": 120},
        ),
    }

    def test_raw_forging_bands_full_crud(self):
        for path, (payload, patch) in self.FORGING_ENDPOINTS.items():
            with self.subTest(table=path):
                url = f"/api/reference/raw-forging/{path}/"
                self.assertEqual(self.sales_client.post(url, payload, format="json").status_code, 403)
                created = self.admin_client.post(url, payload, format="json")
                self.assertEqual(created.status_code, 201, created.data)
                row_id = created.data["id"]
                self.assertEqual(self.sales_client.get(url).status_code, 200)
                self.assertEqual(self.sales_client.patch(f"{url}{row_id}/", patch, format="json").status_code, 403)
                updated = self.admin_client.patch(f"{url}{row_id}/", patch, format="json")
                self.assertEqual(updated.status_code, 200, updated.data)
                for field, value in patch.items():
                    self.assertEqual(updated.data[field], value)
                self.assertEqual(self.admin_client.delete(f"{url}{row_id}/").status_code, 204)
                self.assertEqual(self.admin_client.get(f"{url}{row_id}/").status_code, 404)

    def test_raw_forging_band_required_fields(self):
        response = self.admin_client.post("/api/reference/raw-forging/shaft-bands/", {"material": "C45"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("diameter", response.data)
        self.assertIn("length", response.data)
        response = self.admin_client.post("/api/reference/raw-forging/shell-bands/", {"sourcing": "Inhouse"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("diameter_body", response.data)
        self.assertIn("face_width_body", response.data)

    def test_old_raw_forging_rates_url_is_gone(self):
        self.assertEqual(self.admin_client.get("/api/reference/raw-forging-rates/").status_code, 404)

    # ---- LAG_DATA -------------------------------------------------------------------

    def test_lag_data_crud(self):
        url = "/api/reference/catalogs/lag-data/"
        payload = {"lagging_type": "Test lag 12mm", "thickness_mm": 12, "price_inr_per_m2": 19387, "delivery_days": 14, "description": "Test"}
        self.assertEqual(self.sales_client.post(url, payload, format="json").status_code, 403)
        created = self.admin_client.post(url, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        row_id = created.data["id"]
        self.assertEqual(self.sales_client.get(url).status_code, 200)
        self.assertEqual(self.admin_client.post(url, payload, format="json").status_code, 400)  # lagging_type is unique
        updated = self.admin_client.patch(f"{url}{row_id}/", {"price_inr_per_m2": 20000}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["price_inr_per_m2"], 20000)
        self.assertEqual(self.admin_client.delete(f"{url}{row_id}/").status_code, 204)
        self.assertEqual(self.admin_client.get(f"{url}{row_id}/").status_code, 404)

    def test_lag_data_required_fields(self):
        response = self.admin_client.post("/api/reference/catalogs/lag-data/", {"description": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        for field in ("lagging_type", "thickness_mm", "price_inr_per_m2", "delivery_days"):
            self.assertIn(field, response.data)

    # ---- LCD_DATA -------------------------------------------------------------------

    def test_lcd_data_crud(self):
        url = "/api/reference/catalogs/lcd-data/"
        payload = {"model_size": "Test N7036-100 × 150", "indicative_price": "₹25,000 – ₹35,000", "negotiated_rate_inr": 30000, "remarks": "Estimate"}
        self.assertEqual(self.sales_client.post(url, payload, format="json").status_code, 403)
        created = self.admin_client.post(url, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        row_id = created.data["id"]
        self.assertEqual(self.sales_client.get(url).status_code, 200)
        self.assertEqual(self.admin_client.post(url, payload, format="json").status_code, 400)  # model_size is unique
        updated = self.admin_client.patch(f"{url}{row_id}/", {"negotiated_rate_inr": 32000}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["negotiated_rate_inr"], 32000)
        self.assertEqual(self.admin_client.delete(f"{url}{row_id}/").status_code, 204)
        self.assertEqual(self.admin_client.get(f"{url}{row_id}/").status_code, 404)

    def test_lcd_data_required_fields(self):
        response = self.admin_client.post("/api/reference/catalogs/lcd-data/", {"remarks": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("model_size", response.data)
        self.assertIn("negotiated_rate_inr", response.data)

    # ---- InHouseHourRate full CRUD --------------------------------------------

    def test_in_house_hour_rate_crud(self):
        payload = {"cost_head": "Test Head", "operation": "Test Op", "activity_description": "Test", "mhr_rate": 10}
        response = self.sales_client.post("/api/reference/in-house-hours/", payload, format="json")
        self.assertEqual(response.status_code, 403)

        response = self.admin_client.post("/api/reference/in-house-hours/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        row_id = response.data["id"]

        response = self.sales_client.get("/api/reference/in-house-hours/")
        self.assertEqual(response.status_code, 200)

        response = self.admin_client.patch(f"/api/reference/in-house-hours/{row_id}/", {"mhr_rate": 20}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mhr_rate"], 20)

        response = self.admin_client.delete(f"/api/reference/in-house-hours/{row_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(InHouseHourRate.objects.filter(id=row_id).exists())

    # ---- Catalogs were already open before this change — confirm still true ----

    def test_bearing_catalog_supports_create_and_delete(self):
        payload = {"designation": "TEST-BRG-001", "bore_mm": 50, "price_inr": 1000, "price_eur": 12, "delivery_days": 10}
        response = self.admin_client.post("/api/reference/catalogs/bearings/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        bearing_id = response.data["id"]
        response = self.admin_client.delete(f"/api/reference/catalogs/bearings/{bearing_id}/")
        self.assertEqual(response.status_code, 204)


class OrganizationSettingsApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("orgadmin", "orgadmin@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("orgsales", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

    def test_get_creates_the_singleton_with_defaults_on_first_call(self):
        self.assertEqual(OrganizationSettings.objects.count(), 0)
        response = self.sales_client.get("/api/reference/organization-settings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["default_currency"], "INR")
        self.assertEqual(OrganizationSettings.objects.count(), 1)

    def test_multiple_gets_never_create_a_second_row(self):
        self.sales_client.get("/api/reference/organization-settings/")
        self.sales_client.get("/api/reference/organization-settings/")
        self.admin_client.get("/api/reference/organization-settings/")
        self.assertEqual(OrganizationSettings.objects.count(), 1)

    def test_any_authenticated_user_can_read(self):
        response = self.sales_client.get("/api/reference/organization-settings/")
        self.assertEqual(response.status_code, 200)

    def test_only_admin_can_write(self):
        response = self.sales_client.patch("/api/reference/organization-settings/", {"company_name": "Nope"}, format="json")
        self.assertEqual(response.status_code, 403)

        response = self.admin_client.patch("/api/reference/organization-settings/", {"company_name": "Acme Pulleys"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["company_name"], "Acme Pulleys")
        self.assertEqual(OrganizationSettings.objects.count(), 1)

    def test_update_records_updated_by(self):
        self.admin_client.patch("/api/reference/organization-settings/", {"company_name": "Acme"}, format="json")
        settings_obj = OrganizationSettings.load()
        self.assertEqual(settings_obj.updated_by, self.admin)


class SeedReferenceDataTests(TestCase):
    def test_seed_is_idempotent_and_covers_in_house_hours(self):
        from django.core.management import call_command

        call_command("seed_reference_data")
        first_count = InHouseHourRate.objects.count()
        self.assertEqual(first_count, 6)

        call_command("seed_reference_data")
        self.assertEqual(InHouseHourRate.objects.count(), first_count)


class ReferenceDropdownApiTests(TestCase):
    FIELDS_URL = "/api/reference/catalogs/dropdown-fields/"
    VALUES_URL = "/api/reference/catalogs/dropdown-values/"
    EXPECTED_FIELDS = [
        {"table": "bearings", "label": "Bearing Data", "field": "designation"},
        {"table": "sleeves", "label": "Sleeve Data", "field": "sleeve_code"},
        {"table": "lag-data", "label": "Lag Data", "field": "lagging_type"},
        {"table": "lcd-data", "label": "LCD Data", "field": "model_size"},
        {"table": "housings", "label": "Housing Data", "field": "housing_designation"},
    ]

    def setUp(self):
        sales = User.objects.create_user("ddsales", password="salespass123", role="Sales")
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=sales).key}")

        self.bearing = BearingCatalogEntry.objects.create(designation="22220 E", bore_mm=100, price_inr=1, price_eur=1, delivery_days=1)
        self.sleeve = SleeveCatalogEntry.objects.create(for_bearing="22220 E", sleeve_code="H 320", price_eur=1, price_inr=1)
        self.lag = LagDataEntry.objects.create(lagging_type="Rubber vulc. 12mm", thickness_mm=12, price_inr_per_m2=1, delivery_days=1)
        self.lcd = LcdDataEntry.objects.create(model_size="NMTG N7036-100 x 150", negotiated_rate_inr=1)
        self.housing = HousingCatalogEntry.objects.create(for_bearing="22220 E", housing_designation="SNL 520", price_inr=1, delivery_days=1)

    def values(self, table, field):
        return self.client.get(self.VALUES_URL, {"table": table, "field": field})

    def test_lists_all_dropdown_fields(self):
        response = self.client.get(self.FIELDS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.EXPECTED_FIELDS)

    def test_values_for_each_supported_table(self):
        expected = {
            "bearings": (self.bearing.id, "22220 E"),
            "sleeves": (self.sleeve.id, "H 320"),
            "lag-data": (self.lag.id, "Rubber vulc. 12mm"),
            "lcd-data": (self.lcd.id, "NMTG N7036-100 x 150"),
            "housings": (self.housing.id, "SNL 520"),
        }
        for entry in self.EXPECTED_FIELDS:
            with self.subTest(table=entry["table"]):
                response = self.values(entry["table"], entry["field"])
                self.assertEqual(response.status_code, 200)
                row_id, value = expected[entry["table"]]
                self.assertEqual(response.json(), [{"id": row_id, "value": value}])

    def test_invalid_table(self):
        response = self.values("customers", "designation")
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())

    def test_invalid_field(self):
        for field in ("price_inr", "sleeve_data", "", "id"):
            with self.subTest(field=field):
                response = self.values("sleeves", field)
                self.assertEqual(response.status_code, 400)
                self.assertIn("detail", response.json())

    def test_field_from_another_table_is_rejected(self):
        response = self.values("bearings", "sleeve_code")
        self.assertEqual(response.status_code, 400)

    def test_missing_params(self):
        self.assertEqual(self.client.get(self.VALUES_URL).status_code, 400)

    def test_empty_values_excluded_and_empty_table_returns_empty_list(self):
        SleeveCatalogEntry.objects.create(sleeve_code="", price_eur=1, price_inr=1)
        self.assertEqual(self.values("sleeves", "sleeve_code").json(), [{"id": self.sleeve.id, "value": "H 320"}])

        HousingCatalogEntry.objects.all().delete()
        response = self.values("housings", "housing_designation")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_duplicate_values_collapse_to_lowest_id(self):
        SleeveCatalogEntry.objects.create(for_bearing="22222 E", sleeve_code="H 320", price_eur=2, price_inr=2)
        other = SleeveCatalogEntry.objects.create(sleeve_code="H 318", price_eur=1, price_inr=1)
        response = self.values("sleeves", "sleeve_code")
        self.assertEqual(response.json(), [{"id": other.id, "value": "H 318"}, {"id": self.sleeve.id, "value": "H 320"}])

    def test_requires_authentication(self):
        anonymous = APIClient()
        self.assertIn(anonymous.get(self.FIELDS_URL).status_code, (401, 403))
        self.assertIn(anonymous.get(self.VALUES_URL, {"table": "bearings", "field": "designation"}).status_code, (401, 403))

    def test_existing_catalog_crud_still_reachable(self):
        for path in ("bearings", "sleeves", "lag-data", "lcd-data", "housings"):
            with self.subTest(table=path):
                self.assertEqual(self.client.get(f"/api/reference/catalogs/{path}/").status_code, 200)
        self.assertEqual(self.client.get(f"/api/reference/catalogs/bearings/{self.bearing.id}/").status_code, 200)
