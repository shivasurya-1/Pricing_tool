from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import CostRateCategory, CostRateValue, InHouseHourRate, RawForgingRate

User = get_user_model()


class ReferenceApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("refadmin", "refadmin@example.com", "adminpass123", role="Admin")
        self.sales = User.objects.create_user("refsales", password="salespass123", role="Sales")
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

        self.rate = CostRateValue.objects.create(key="testRate", label="Test Rate", category=CostRateCategory.GLOBAL, value=5, unit="INR")
        self.band = RawForgingRate.objects.create(part="shaft", size_band_label="Test Band", plate_rate_inr_per_kg=100)

    # ---- CostRateValue create/delete ---------------------------------------------

    def test_only_controlling_or_admin_can_create_cost_rate(self):
        payload = {"key": "newRate", "label": "New Rate", "category": "Global", "value": 1, "unit": ""}
        response = self.sales_client.post("/api/reference/cost-rates/", payload, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.admin_client.post("/api/reference/cost-rates/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(CostRateValue.objects.filter(key="newRate").exists())

    def test_anyone_authenticated_can_list_cost_rates(self):
        response = self.sales_client.get("/api/reference/cost-rates/")
        self.assertEqual(response.status_code, 200)

    def test_cost_rate_value_is_editable(self):
        response = self.admin_client.patch(f"/api/reference/cost-rates/{self.rate.id}/", {"value": 99}, format="json")
        self.assertEqual(response.status_code, 200)
        self.rate.refresh_from_db()
        self.assertEqual(self.rate.value, 99)

    def test_cost_rate_can_be_deleted(self):
        response = self.admin_client.delete(f"/api/reference/cost-rates/{self.rate.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(CostRateValue.objects.filter(id=self.rate.id).exists())

    # ---- RawForgingRate create/delete ---------------------------------------------

    def test_only_controlling_or_admin_can_create_raw_forging_rate(self):
        payload = {"part": "shell", "size_band_label": "New Band", "plate_rate_inr_per_kg": 50}
        response = self.sales_client.post("/api/reference/raw-forging-rates/", payload, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.admin_client.post("/api/reference/raw-forging-rates/", payload, format="json")
        self.assertEqual(response.status_code, 201)

    def test_raw_forging_rate_can_be_deleted(self):
        response = self.admin_client.delete(f"/api/reference/raw-forging-rates/{self.band.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(RawForgingRate.objects.filter(id=self.band.id).exists())

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


class SeedReferenceDataTests(TestCase):
    def test_seed_is_idempotent_and_covers_in_house_hours(self):
        from django.core.management import call_command

        call_command("seed_reference_data")
        first_count = InHouseHourRate.objects.count()
        self.assertEqual(first_count, 6)

        call_command("seed_reference_data")
        self.assertEqual(InHouseHourRate.objects.count(), first_count)
