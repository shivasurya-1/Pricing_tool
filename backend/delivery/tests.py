from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .calc import activity_days
from .models import DeliveryActivity

User = get_user_model()
URL = "/api/delivery-schedule/"


class ActivityDaysTests(TestCase):
    """The workbook's Unit column: =IF(C="Outsource",IF(E<>"",E,D),IF(C="In-house",D,IF(C="Logistics",D,0)))"""

    def test_outsource_uses_override_when_set_else_std(self):
        self.assertEqual(activity_days("Outsource", 7, 10), 10)
        self.assertEqual(activity_days("Outsource", 7, None), 7)
        self.assertEqual(activity_days("Outsource", 7, 0), 0)  # a typed 0 is a real override

    def test_in_house_and_logistics_ignore_override(self):
        self.assertEqual(activity_days("In-house", 1, 2), 1)
        self.assertEqual(activity_days("Logistics", 1, 5), 1)

    def test_dash_counts_zero(self):
        self.assertEqual(activity_days("—", 5, 5), 0)


class DeliveryScheduleApiTests(TestCase):
    def setUp(self):
        def client_for(username, role):
            user = User.objects.create_user(username, password="pass12345", role=role)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            return client

        self.sourcing = client_for("sourcing-ds", "Sourcing")
        self.sales = client_for("sales-ds", "Sales")

    def rows_for_put(self, data):
        return [{k: r[k] for k in ("id", "sourcing", "std_days", "override_days")} for r in data["activities"]]

    def test_seeded_sheet_matches_the_workbook_139_days_24_weeks(self):
        res = self.sales.get(URL)
        self.assertEqual(res.status_code, 200)
        data = res.data
        self.assertEqual(len(data["activities"]), 29)
        self.assertEqual(data["max_group_days"], 84)
        self.assertEqual(data["sum_group_days"], 55)
        self.assertEqual(data["total_days"], 139)
        self.assertAlmostEqual(data["delivery_weeks"], 139 / 7 * 1.2)
        by_label = {r["label"]: r for r in data["activities"]}
        self.assertEqual(by_label["Weld Preparation"]["days"], 1)  # In-house ignores override 2
        self.assertEqual(by_label["Machining – Body (turning, boring, facing)"]["days"], 10)
        self.assertEqual(by_label["Weekend Buffer"]["days"], 0)

    def test_save_input_cells_recalculates_like_the_workbook(self):
        data = self.sales.get(URL).data
        rows = self.rows_for_put(data)
        labels = {r["id"]: r["label"] for r in data["activities"]}
        for r in rows:
            if labels[r["id"]] == "Shaft (Procurement / Machining)":
                r["override_days"] = 100  # MAX(F28:F32) now 100 instead of 84
            if labels[r["id"]] == "Lagging Application":
                r["sourcing"] = "—"  # F34 now 0, so the added rows sum to 41
        res = self.sourcing.put(URL, {"safety_factor": 1.5, "activities": rows}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total_days"], 100 + 41)
        self.assertAlmostEqual(res.data["delivery_weeks"], 141 / 7 * 1.5)

    def test_workbook_rows_cannot_be_renamed_but_can_be_deleted(self):
        data = self.sales.get(URL).data
        rows = self.rows_for_put(data)
        unknown_id = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows + [{"id": 99999, "sourcing": "In-house", "std_days": 1}]}, format="json")
        self.assertEqual(unknown_id.status_code, 400)
        rows[0].update(label="Renamed", total_group="none")  # ignored on a workbook row
        self.assertEqual(self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows}, format="json").status_code, 200)
        self.assertFalse(DeliveryActivity.objects.filter(label="Renamed").exists())
        self.assertEqual(self.sales.get(URL).data["total_days"], 139)

        lagging_id = next(a["id"] for a in data["activities"] if a["label"] == "Lagging Application")
        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": [r for r in rows if r["id"] != lagging_id]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((len(res.data["activities"]), res.data["total_days"]), (28, 139 - 14))

    def new_row(self, **overrides):
        return {"phase": "PHASE 5: FINAL ASSEMBLY & DISPATCH", "label": "Customer Inspection", "sourcing": "In-house",
                "std_days": 3, "override_days": None, "notes": "Witness test", **overrides}

    def test_added_row_counts_in_total_and_weeks_and_can_be_deleted(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows + [self.new_row()]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total_days"], 139 + 3)
        self.assertAlmostEqual(res.data["delivery_weeks"], 142 / 7 * 1.2)
        added = res.data["activities"][-1]
        self.assertEqual((added["label"], added["is_custom"], added["days"]), ("Customer Inspection", True, 3))

        # Moved to Phase 3 it joins MAX(F28:F32): it only counts if it beats the 84-day parts.
        rows = self.rows_for_put(res.data)
        rows[-1].update(label="Gearbox", total_group="none", std_days=90, phase="PHASE 3: PURCHASED COMPONENTS")
        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows}, format="json")
        self.assertEqual(res.data["activities"][-1]["total_group"], "max")  # from the phase, not the request
        self.assertEqual(res.data["total_days"], 90 + 55)

        # In Phase 1 (pulley body, not in the formula) it isn't counted at all.
        rows[-1].update(phase="PHASE 1: PULLEY BODY")
        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows}, format="json")
        self.assertEqual((res.data["activities"][-1]["total_group"], res.data["total_days"]), ("none", 139))

        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows[:-1]}, format="json")  # delete it
        self.assertEqual((res.status_code, res.data["total_days"], len(res.data["activities"])), (200, 139, 29))

    def test_added_row_needs_a_name_and_an_existing_phase(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        no_name = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows + [self.new_row(label=" ")]}, format="json")
        self.assertEqual(no_name.status_code, 400)
        bad_phase = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows + [self.new_row(phase="PHASE 9")]}, format="json")
        self.assertEqual(bad_phase.status_code, 400)
        self.assertEqual(DeliveryActivity.objects.count(), 29)

    def test_reset_restores_the_workbook(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        for r in rows:
            r["sourcing"] = "—"
        self.sourcing.put(URL, {"safety_factor": 2, "activities": rows + [self.new_row()]}, format="json")
        self.assertEqual(DeliveryActivity.objects.count(), 30)
        res = self.sourcing.post(URL + "reset/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((len(res.data["activities"]), res.data["total_days"], res.data["safety_factor"]), (29, 139, 1.2))

    def test_patch_saves_like_put(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        res = self.sourcing.patch(URL, {"safety_factor": 1.0, "activities": rows}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["safety_factor"], 1.0)

    def test_sales_can_view_but_not_edit(self):
        data = self.sales.get(URL).data
        res = self.sales.put(URL, {"safety_factor": 1.2, "activities": self.rows_for_put(data)}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.sales.post(URL + "reset/").status_code, 403)

    def test_invalid_rows_are_rejected(self):
        data = self.sales.get(URL).data
        rows = self.rows_for_put(data)
        rows[0]["sourcing"] = "Somewhere"
        rows[1]["std_days"] = -1
        res = self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows}, format="json")
        self.assertEqual(res.status_code, 400)


class CriticalPathFieldsTests(DeliveryScheduleApiTests):
    """Each row's ID, In tick and "Depends on" are stored with the sheet."""

    def put_rows(self, rows, **extra):
        return self.sourcing.put(URL, {"safety_factor": 1.2, "activities": rows, **extra}, format="json")

    def full_rows(self):
        return [
            {k: r[k] for k in ("id", "sourcing", "std_days", "override_days", "included", "depends_on")}
            for r in self.sales.get(URL).data["activities"]
        ]

    def test_seed_has_ids_and_the_workbook_dependencies(self):
        by_code = {r["code"]: r for r in self.sales.get(URL).data["activities"]}
        self.assertEqual(len(by_code), 29)
        self.assertEqual(by_code["C1"]["depends_on"], ["PU1", "PU2", "PU3", "PU4", "PU5"])
        self.assertTrue(by_code["PU1"]["included"])
        self.assertEqual(by_code["B2"]["depends_on"], ["B1"])  # body manufacturing is chained but has float

    def test_links_and_in_tick_are_saved(self):
        rows = self.full_rows()
        by_id = {r["id"]: r for r in self.sales.get(URL).data["activities"]}
        c1 = next(r for r in rows if by_id[r["id"]]["code"] == "C1")
        c1.update(depends_on=["H5"], included=True)
        res = self.put_rows(rows)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(next(a for a in res.data["activities"] if a["code"] == "C1")["depends_on"], ["H5"])

    def test_added_row_keeps_its_id_and_links(self):
        rows = self.full_rows()
        new = {"phase": "PHASE 5: FINAL ASSEMBLY & DISPATCH", "label": "Customer Inspection", "sourcing": "In-house", "std_days": 3,
               "code": "N7", "included": True, "depends_on": ["F2"]}
        res = self.put_rows(rows + [new])
        self.assertEqual(res.status_code, 200, res.data)
        added = res.data["activities"][-1]
        self.assertEqual((added["code"], added["depends_on"]), ("N7", ["F2"]))
        again = self.full_rows()
        again[-1].update(label="Customer Inspection", phase=new["phase"])  # a saved added row is sent with its name
        clash = self.put_rows(again + [{**new, "code": "A1", "label": "Another"}])  # not an N-number: gets the next free one
        self.assertEqual(clash.status_code, 200, clash.data)
        self.assertEqual(clash.data["activities"][-1]["code"], "N1")

    def test_links_to_deleted_rows_are_dropped(self):
        rows = self.full_rows()
        by_id = {r["id"]: r for r in self.sales.get(URL).data["activities"]}
        l1_id = next(i for i, a in by_id.items() if a["code"] == "L1")
        res = self.put_rows([r for r in rows if r["id"] != l1_id])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(next(a for a in res.data["activities"] if a["code"] == "L2")["depends_on"], [])

    def test_self_and_circular_links_are_refused(self):
        rows = self.full_rows()
        by_id = {r["id"]: r for r in self.sales.get(URL).data["activities"]}
        row = lambda code: next(r for r in rows if by_id[r["id"]]["code"] == code)
        row("F1")["depends_on"] = ["F1"]
        self.assertEqual(self.put_rows(rows).status_code, 400)
        row("F1")["depends_on"] = ["L2"]
        row("A2")["depends_on"] = ["F3"]  # A2 -> ... -> F3 -> A2
        res = self.put_rows(rows)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Circular", res.data["detail"])

    def test_reset_restores_workbook_links(self):
        rows = self.full_rows()
        for r in rows:
            r["depends_on"] = []
        self.put_rows(rows)
        res = self.sourcing.post(URL + "reset/")
        self.assertEqual(next(a for a in res.data["activities"] if a["code"] == "F1")["depends_on"], ["L2"])
