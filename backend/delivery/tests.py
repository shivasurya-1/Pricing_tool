from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .calc import activity_days, critical_path, find_cycle, reroute_links
from .models import DeliveryActivity, DeliveryScheduleVersion

User = get_user_model()
URL = "/api/delivery-schedule/"
PU = ["PU1", "PU2", "PU3", "PU4", "PU5"]
# Workbook rows on the 139-day chain; F3 (Weekend Buffer, "—") is 0 days so never critical.
DEFAULT_CRITICAL = ["A1", "A2", "C1", "C2", "C3", "C4", "PU1", "PU3", "L1", "L2", "F1", "F2"]


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


def row(code, days, deps=(), included=True):
    return {"code": code, "days": days, "depends_on": list(deps), "included": included}


class CriticalPathTests(TestCase):
    def test_forward_backward_pass_and_float(self):
        # S(2) → A(10) → E(1); S → B(4) → E: B has 6 days of float.
        res = critical_path([row("S", 2), row("A", 10, ["S"]), row("B", 4, ["S"]), row("E", 1, ["A", "B"])])
        t = res["timings"]
        self.assertEqual(res["total_days"], 13)
        self.assertEqual((t["A"]["es"], t["A"]["ef"], t["A"]["ls"], t["A"]["lf"]), (2, 12, 2, 12))
        self.assertEqual((t["B"]["es"], t["B"]["ef"], t["B"]["ls"], t["B"]["lf"], t["B"]["float"]), (2, 6, 8, 12, 6))
        self.assertEqual(res["critical_codes"], ["S", "A", "E"])

    def test_two_equal_chains_are_both_critical(self):
        res = critical_path([row("A", 5), row("B", 3), row("C", 2, ["B"]), row("D", 1, ["A", "C"])])
        self.assertEqual(res["total_days"], 6)
        self.assertEqual(res["critical_codes"], ["A", "B", "C", "D"])

    def test_zero_day_row_is_never_critical(self):
        res = critical_path([row("A", 5), row("Z", 0, ["A"])])
        self.assertEqual((res["timings"]["Z"]["float"], res["timings"]["Z"]["critical"]), (0, False))
        self.assertEqual(res["critical_codes"], ["A"])

    def test_unconnected_rows_run_in_parallel_from_day_zero(self):
        res = critical_path([row("A", 5), row("B", 9)])
        self.assertEqual((res["total_days"], res["critical_codes"], res["timings"]["A"]["float"]), (9, ["B"], 4))

    def test_unknown_and_self_links_are_ignored(self):
        res = critical_path([row("A", 5, ["A", "GHOST"]), row("B", 2, ["A", "NOPE"])])
        self.assertEqual(res["total_days"], 7)

    def test_excluded_row_passes_through_without_timings(self):
        # A(3) → X(50, excluded) → B(2): X counts as 0 days, the chain stays joined.
        res = critical_path([row("A", 3), row("X", 50, ["A"], included=False), row("B", 2, ["X"])])
        self.assertEqual((res["total_days"], res["timings"]["B"]["es"]), (5, 3))
        self.assertEqual((res["timings"]["X"]["es"], res["timings"]["X"]["critical"]), (None, False))
        self.assertEqual(res["critical_codes"], ["A", "B"])

    def test_fractional_days_have_no_float_noise(self):
        res = critical_path([row("A", 0.1), row("B", 0.2, ["A"])])
        self.assertEqual((res["total_days"], res["critical_codes"]), (0.3, ["A", "B"]))

    def test_cycle_raises(self):
        with self.assertRaises(ValueError):
            critical_path([row("A", 1, ["B"]), row("B", 1, ["A"])])

    def test_find_cycle(self):
        self.assertIsNone(find_cycle({"A": [], "B": ["A"], "C": ["B", "GHOST"]}))
        self.assertEqual(find_cycle({"A": ["C"], "B": ["A"], "C": ["B"]}), ["A", "C", "B", "A"])

    def test_reroute_links_through_deleted_rows(self):
        kept = {"A1", "A3"}
        removed = {"A2": ["A1"], "X": ["A2", "A3"]}
        self.assertEqual(reroute_links(["X", "GHOST"], kept, removed), ["A1", "A3"])


class DeliveryScheduleApiTests(TestCase):
    def setUp(self):
        def client_for(username, role):
            user = User.objects.create_user(username, password="pass12345", role=role)
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=user).key}")
            return client

        self.sourcing = client_for("sourcing-ds", "Sourcing")
        self.sales = client_for("sales-ds", "Sales")

    def rows_for_put(self, data, links=False):
        fields = ("id", "sourcing", "std_days", "override_days") + (("included", "depends_on") if links else ())
        return [{k: r[k] for k in fields} for r in data["activities"]]

    def save(self, rows, safety_factor=1.2, **extra):
        return self.sourcing.patch(URL, {"safety_factor": safety_factor, "activities": rows, **extra}, format="json")

    def linked_rows(self):
        """The sheet's rows with their links, keyed by code for editing."""
        rows = self.rows_for_put(self.sales.get(URL).data, links=True)
        codes = [a.code for a in DeliveryActivity.objects.all()]
        return rows, dict(zip(codes, rows))

    def test_seeded_sheet_is_the_workbook_critical_path_139_days_24_weeks(self):
        res = self.sales.get(URL)
        self.assertEqual(res.status_code, 200)
        data = res.data
        self.assertEqual(len(data["activities"]), 29)
        self.assertEqual(data["total_days"], 139)
        self.assertAlmostEqual(data["delivery_weeks"], 139 / 7 * 1.2)
        self.assertEqual(round(data["delivery_weeks"]), 24)
        self.assertEqual(data["critical_codes"], DEFAULT_CRITICAL)
        by_code = {r["code"]: r for r in data["activities"]}
        self.assertEqual(by_code["B3"]["days"], 1)  # In-house ignores override 2
        self.assertEqual(by_code["C3"]["days"], 10)  # Machining – Body, outsourced: override 10
        self.assertEqual(by_code["F3"]["days"], 0)  # Weekend Buffer "—"
        self.assertEqual((by_code["PU2"]["es"], by_code["PU2"]["ef"], by_code["PU2"]["float"]), (7, 67, 24))
        self.assertEqual((by_code["F2"]["ef"], by_code["F2"]["critical"]), (139, True))
        self.assertEqual((by_code["B1"]["included"], by_code["B1"]["es"]), (False, None))  # Phase 1 starts excluded
        self.assertEqual(by_code["C1"]["depends_on"], PU)
        # Old fields kept for older clients.
        self.assertEqual((data["max_group_days"], data["sum_group_days"]), (84, 55))
        self.assertIsNone(data["current_version"])

    def test_parallel_body_dependencies_give_97_days_with_two_critical_chains(self):
        rows, by_code = self.linked_rows()
        for code in ["B1", "B2", "B3", "B4", "B5", "B6", "H1", "H2", "H3", "H4", "H5"]:
            by_code[code]["included"] = True
        by_code["C1"]["depends_on"] = ["H5"]  # stress relief follows the welded body...
        by_code["F1"]["depends_on"] = ["L2", *PU]  # ...and the bought parts meet it at assembly
        res = self.save(rows)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total_days"], 97)
        self.assertAlmostEqual(res.data["delivery_weeks"], 97 / 7 * 1.2)
        crit = res.data["critical_codes"]
        # Both the shell chain (ends day 91 at L2) and the shaft/housing (end day 91) are critical.
        for code in ["A1", "A2", "B1", "B6", "H4", "H5", "C1", "L2", "PU1", "PU3", "F1", "F2"]:
            self.assertIn(code, crit)
        for code in ["H1", "H2", "H3", "PU2", "PU4", "PU5", "F3"]:
            self.assertNotIn(code, crit)
        by_code = {r["code"]: r for r in res.data["activities"]}
        self.assertEqual((by_code["H3"]["float"], by_code["PU2"]["float"], by_code["F1"]["es"]), (2, 24, 91))

    def test_save_input_cells_recalculates(self):
        rows, by_code = self.linked_rows()
        by_code["PU1"]["override_days"] = 100  # shaft now 100 days instead of 84
        by_code["L1"]["sourcing"] = "—"  # lagging now 0 days
        res = self.save(rows, safety_factor=1.5)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total_days"], 139 + 16 - 14)
        self.assertAlmostEqual(res.data["delivery_weeks"], 141 / 7 * 1.5)
        self.assertNotIn("PU3", res.data["critical_codes"])  # housing (84) now has 16 days of float
        self.assertNotIn("L1", res.data["critical_codes"])  # a 0-day row is never critical

    def test_workbook_rows_cannot_be_renamed_but_can_be_deleted(self):
        data = self.sales.get(URL).data
        rows = self.rows_for_put(data)
        unknown_id = self.save(rows + [{"id": 99999, "sourcing": "In-house", "std_days": 1}])
        self.assertEqual(unknown_id.status_code, 400)
        rows[0].update(label="Renamed", total_group="none", code="ZZ")  # ignored on a workbook row
        self.assertEqual(self.save(rows).status_code, 200)
        self.assertFalse(DeliveryActivity.objects.filter(label="Renamed").exists())
        self.assertTrue(DeliveryActivity.objects.filter(code="A1").exists())
        self.assertEqual(self.sales.get(URL).data["total_days"], 139)

    def test_deleted_rows_links_are_dropped_and_the_chain_stays_joined(self):
        rows, by_code = self.linked_rows()
        lagging_id = by_code["L1"]["id"]
        res = self.save([r for r in rows if r["id"] != lagging_id])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((len(res.data["activities"]), res.data["total_days"]), (28, 139 - 14))
        after = {r["code"]: r for r in res.data["activities"]}
        self.assertEqual(after["L2"]["depends_on"], ["C4"])  # was L1, now L1's own predecessor
        self.assertFalse(any("L1" in r["depends_on"] for r in res.data["activities"]))

    def test_unknown_link_codes_are_dropped(self):
        rows, by_code = self.linked_rows()
        by_code["A2"]["depends_on"] = ["A1", "NOPE"]
        res = self.save(rows)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(DeliveryActivity.objects.get(code="A2").depends_on, ["A1"])

    def test_self_dependency_is_rejected(self):
        rows, by_code = self.linked_rows()
        by_code["A2"]["depends_on"] = ["A1", "A2"]
        res = self.save(rows)
        self.assertEqual(res.status_code, 400)
        self.assertIn("can't depend on itself", res.data["detail"])
        self.assertEqual(DeliveryActivity.objects.get(code="A2").depends_on, ["A1"])

    def test_circular_dependency_is_rejected(self):
        rows, by_code = self.linked_rows()
        by_code["A1"]["depends_on"] = ["F2"]
        res = self.save(rows)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Circular dependency", res.data["detail"])
        self.assertIn("A1", res.data["detail"])
        self.assertEqual(DeliveryActivity.objects.get(code="A1").depends_on, [])
        self.assertEqual(DeliveryScheduleVersion.objects.count(), 0)

    def new_row(self, **overrides):
        return {"phase": "PHASE 5: FINAL ASSEMBLY & DISPATCH", "label": "Customer Inspection", "sourcing": "In-house",
                "std_days": 3, "override_days": None, "notes": "Witness test", **overrides}

    def test_added_row_gets_next_n_code_and_counts_once_linked(self):
        rows, _ = self.linked_rows()
        # Not linked: it runs in parallel from day 0, so the total doesn't move.
        res = self.save(rows + [self.new_row()])
        self.assertEqual(res.status_code, 200, res.data)
        added = res.data["activities"][-1]
        self.assertEqual((added["code"], added["is_custom"], added["days"], added["es"]), ("N1", True, 3, 0))
        self.assertEqual(res.data["total_days"], 139)

        # Linked after painting (F2), with the buffer (F3) after it, it adds 3 days.
        rows, by_code = self.linked_rows()
        by_code["N1"]["depends_on"] = ["F2"]
        by_code["F3"]["depends_on"] = ["N1"]
        res = self.save(rows)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["total_days"], 142)
        self.assertAlmostEqual(res.data["delivery_weeks"], 142 / 7 * 1.2)
        self.assertIn("N1", res.data["critical_codes"])

        # A second new row gets N2; one sent with its own code keeps it and can be linked to at once.
        rows, by_code = self.linked_rows()
        res = self.save(rows + [self.new_row(label="Paperwork"), self.new_row(label="FAT", code="FAT1"),
                                self.new_row(label="Docs", depends_on=["FAT1"])])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([r["code"] for r in res.data["activities"][-3:]], ["N2", "FAT1", "N3"])
        self.assertEqual(res.data["activities"][-1]["depends_on"], ["FAT1"])

        # Deleting it joins F3 back to F2.
        rows, by_code = self.linked_rows()
        res = self.save([r for r in rows if r["id"] != by_code["N1"]["id"]])
        self.assertEqual(res.data["total_days"], 139)
        self.assertEqual({r["code"]: r for r in res.data["activities"]}["F3"]["depends_on"], ["F2"])

    def test_added_row_needs_a_name_and_an_existing_phase(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        no_name = self.save(rows + [self.new_row(label=" ")])
        self.assertEqual(no_name.status_code, 400)
        bad_phase = self.save(rows + [self.new_row(phase="PHASE 9")])
        self.assertEqual(bad_phase.status_code, 400)
        self.assertEqual(DeliveryActivity.objects.count(), 29)

    def test_invalid_values_get_clear_messages(self):
        rows = self.rows_for_put(self.sales.get(URL).data)

        def errors_for(change, safety_factor=1.2):
            sent = [dict(r) for r in rows]
            change(sent)
            res = self.save(sent, safety_factor=safety_factor)
            self.assertEqual(res.status_code, 400)
            return res.data["detail"]

        self.assertIn("Row 3 (Shell Plate Procurement) – Std days: can't be negative.",
                      errors_for(lambda s: s[2].update(std_days=-1)))
        self.assertIn("Override days: must be a number.", errors_for(lambda s: s[2].update(override_days="ten")))
        self.assertIn("Std days: must be a number.", errors_for(lambda s: s[2].update(std_days=True)))
        self.assertIn("Safety factor: must be greater than 0.", errors_for(lambda s: None, safety_factor=0))
        self.assertIn("Safety factor: must be greater than 0.", errors_for(lambda s: None, safety_factor=-1))
        self.assertIn('"Somewhere" is not a sourcing option', errors_for(lambda s: s[0].update(sourcing="Somewhere")))
        both = self.save([dict(rows[0], sourcing="Somewhere"), dict(rows[1], std_days=-1)] + rows[2:])
        self.assertEqual(len(both.data["errors"]), 2)

    def test_duplicate_codes_are_rejected(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        res = self.save(rows + [self.new_row(code="A1")])
        self.assertEqual(res.status_code, 400)
        self.assertIn("Code 'A1' is used by more than one row", res.data["detail"])
        res = self.save(rows + [self.new_row(code="X1"), self.new_row(label="Other", code="X1")])
        self.assertEqual(res.status_code, 400)
        res = self.save(rows + [self.new_row(code="1 bad")])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(DeliveryActivity.objects.count(), 29)

    def test_reset_restores_the_workbook_and_its_links(self):
        rows, by_code = self.linked_rows()
        for r in rows:
            r["sourcing"] = "—"
            r["depends_on"] = []
        self.save(rows + [self.new_row()], safety_factor=2)
        self.assertEqual(DeliveryActivity.objects.count(), 30)
        res = self.sourcing.post(URL + "reset/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual((len(res.data["activities"]), res.data["total_days"], res.data["safety_factor"]), (29, 139, 1.2))
        self.assertEqual(res.data["critical_codes"], DEFAULT_CRITICAL)
        self.assertEqual(res.data["current_version"]["change_summary"], "Reset to workbook defaults")

    def test_put_saves_like_patch(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        res = self.sourcing.put(URL, {"safety_factor": 1.0, "activities": rows}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["safety_factor"], 1.0)

    def test_every_save_is_a_version_and_can_be_restored(self):
        rows, by_code = self.linked_rows()
        by_code["PU1"]["override_days"] = 100
        first = self.save(rows)
        self.assertEqual(first.data["current_version"]["version_label"], "v1")
        self.assertEqual(first.data["current_version"]["change_summary"], "Changed PU1")
        self.assertEqual(first.data["current_version"]["saved_by"], "sourcing-ds")

        rows, by_code = self.linked_rows()
        self.save([r for r in rows if r["id"] != by_code["L1"]["id"]], safety_factor=1.5, change_summary="No lagging")

        listing = self.sales.get(URL + "versions/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([(v["version_label"], v["change_summary"], v["total_days"]) for v in listing.data],
                         [("v2", "No lagging", 141), ("v1", "Changed PU1", 155)])
        v1 = listing.data[1]

        detail = self.sales.get(f"{URL}versions/{v1['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual((detail.data["safety_factor"], len(detail.data["activities"])), (1.2, 29))
        self.assertEqual(detail.data["critical_codes"], v1["critical_codes"])
        self.assertIn("es", detail.data["activities"][0])

        restored = self.sourcing.post(f"{URL}versions/{v1['id']}/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual((restored.data["total_days"], restored.data["safety_factor"], len(restored.data["activities"])), (155, 1.2, 29))
        self.assertEqual(restored.data["current_version"]["version_label"], "v3")
        self.assertEqual(restored.data["current_version"]["change_summary"], "Restored v1")
        self.assertEqual(self.sourcing.get(f"{URL}versions/9999/").status_code, 404)

    def test_failed_save_makes_no_version(self):
        rows = self.rows_for_put(self.sales.get(URL).data)
        self.save(rows, safety_factor=0)
        self.assertEqual(DeliveryScheduleVersion.objects.count(), 0)

    def test_sales_can_view_but_not_edit_reset_or_restore(self):
        data = self.sales.get(URL).data
        self.save(self.rows_for_put(data))
        version_id = DeliveryScheduleVersion.objects.get().id
        res = self.sales.patch(URL, {"safety_factor": 1.2, "activities": self.rows_for_put(data)}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.sales.put(URL, {"safety_factor": 1.2, "activities": []}, format="json").status_code, 403)
        self.assertEqual(self.sales.post(URL + "reset/").status_code, 403)
        self.assertEqual(self.sales.post(f"{URL}versions/{version_id}/restore/").status_code, 403)
        self.assertEqual(self.sales.get(URL + "versions/").status_code, 200)
        self.assertEqual(self.sales.get(f"{URL}versions/{version_id}/").status_code, 200)
        self.assertIn(APIClient().get(URL).status_code, (401, 403))


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
        self.assertEqual(by_code["B2"]["depends_on"], ["B1"])  # body manufacturing is chained...
        self.assertFalse(by_code["B1"]["included"])  # ...but starts excluded, as in the workbook

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
        clash = self.put_rows(again + [{**new, "code": "A1", "label": "Another"}])  # a code already in use is refused
        self.assertEqual(clash.status_code, 400, clash.data)
        self.assertIn("Code 'A1' is used by more than one row", clash.data["detail"])

    def test_links_to_deleted_rows_go_to_their_predecessors(self):
        rows = self.full_rows()
        by_id = {r["id"]: r for r in self.sales.get(URL).data["activities"]}
        l1_id = next(i for i, a in by_id.items() if a["code"] == "L1")
        res = self.put_rows([r for r in rows if r["id"] != l1_id])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(next(a for a in res.data["activities"] if a["code"] == "L2")["depends_on"], ["C4"])

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
