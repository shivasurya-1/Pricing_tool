from rest_framework.test import APIClient
from django.test import TestCase

from .models import Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQItem


def client_as(role: str) -> APIClient:
    c = APIClient()
    c.credentials(HTTP_X_DEMO_ROLE=role)
    return c


class RFQWorkflowTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(id="cust-1", code="CUST-001", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-1", code="PROD-1", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        self.operations = client_as("Operations")
        self.sourcing = client_as("Sourcing")
        self.controlling = client_as("Controlling")
        self.approval = client_as("Approval Panel")

    def _create_rfq(self, submit=False):
        response = self.sales.post(
            "/api/rfq/rfqs/",
            {
                "customerId": self.customer.id,
                "actorName": "Test Sales",
                "submit": submit,
                "items": [{"productId": self.product.id, "quantity": 10, "targetPrice": 100}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    # ---- basic auth / read access -------------------------------------------------

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().get("/api/rfq/rfqs/")
        self.assertIn(response.status_code, (401, 403))

    def test_any_authenticated_role_can_read(self):
        self._create_rfq()
        response = self.controlling.get("/api/rfq/rfqs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    # ---- creation -------------------------------------------------------------

    def test_create_rfq_starts_in_draft(self):
        rfq_id = self._create_rfq()
        rfq = RFQ.objects.get(id=rfq_id)
        self.assertEqual(rfq.stage, "Draft")
        self.assertEqual(rfq.items.count(), 1)
        self.assertEqual(rfq.audit_events.count(), 1)

    def test_create_with_submit_true_goes_straight_to_operations_review(self):
        rfq_id = self._create_rfq(submit=True)
        rfq = RFQ.objects.get(id=rfq_id)
        self.assertEqual(rfq.stage, "Operations Review")
        self.assertEqual(rfq.audit_events.count(), 2)

    # ---- stage transitions persist correctly (regression: touch() bug) ---------

    def test_submit_persists_stage_change_to_the_database(self):
        rfq_id = self._create_rfq()
        self.sales.post(f"/api/rfq/rfqs/{rfq_id}/submit/", {"actorName": "Test Sales"}, format="json")
        rfq = RFQ.objects.get(id=rfq_id)
        self.assertEqual(rfq.stage, "Operations Review")
        self.assertEqual(rfq.status, "Operations Review")

    def test_full_pipeline_reaches_quotation_sent(self):
        rfq_id = self._create_rfq()
        self.sales.post(f"/api/rfq/rfqs/{rfq_id}/submit/", {"actorName": "Sales"}, format="json")
        self.operations.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")

        item_id = RFQItem.objects.get(rfq_id=rfq_id).id
        self.sourcing.patch(
            f"/api/rfq/rfqs/{rfq_id}/item-sourcing-confirmed/",
            {"itemId": item_id, "confirmed": True},
            format="json",
        )
        response = self.sourcing.post(f"/api/rfq/rfqs/{rfq_id}/submit-sourcing/", {"actorName": "Sourcing"}, format="json")
        self.assertEqual(response.data["stage"], "Controlling")

        self.controlling.post(
            f"/api/rfq/rfqs/{rfq_id}/cost-breakdown/",
            {"lines": [{"itemId": item_id, "baseCost": 80, "sellingPrice": 100, "finalPrice": 110}]},
            format="json",
        )
        self.controlling.post(f"/api/rfq/rfqs/{rfq_id}/submit-controlling/", {"actorName": "Controlling"}, format="json")
        self.approval.post(f"/api/rfq/rfqs/{rfq_id}/approve-final/", {"actorName": "Approver"}, format="json")

        gen = self.sales.post(f"/api/rfq/rfqs/{rfq_id}/generate-quotation/", {"actorName": "Sales"}, format="json")
        self.assertEqual(gen.status_code, 201)
        quotation_id = gen.data["id"]

        sent = self.sales.post(f"/api/rfq/rfqs/{rfq_id}/send-quotation/", {"actorName": "Sales"}, format="json")
        self.assertEqual(sent.data["stage"], "Quotation Sent")
        self.assertEqual(Quotation.objects.get(id=quotation_id).status, "Sent")

        rfq = RFQ.objects.get(id=rfq_id)
        self.assertEqual(rfq.audit_events.count(), 8)

    # ---- workflow enforcement ---------------------------------------------------

    def test_wrong_stage_transition_is_rejected(self):
        rfq_id = self._create_rfq()  # still Draft
        response = self.operations.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(RFQ.objects.get(id=rfq_id).stage, "Draft")

    def test_wrong_role_cannot_act_on_stage(self):
        rfq_id = self._create_rfq(submit=True)  # now Operations Review
        response = self.sales.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Sales"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(RFQ.objects.get(id=rfq_id).stage, "Operations Review")

    def test_admin_can_act_on_any_stage(self):
        rfq_id = self._create_rfq(submit=True)
        admin = client_as("Admin")
        response = admin.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Admin"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stage"], "Sourcing")

    def test_submit_sourcing_requires_every_item_confirmed(self):
        rfq_id = self._create_rfq(submit=True)
        self.operations.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")
        response = self.sourcing.post(f"/api/rfq/rfqs/{rfq_id}/submit-sourcing/", {"actorName": "Sourcing"}, format="json")
        self.assertEqual(response.status_code, 400)

    # ---- send-back / reject -----------------------------------------------------

    def test_send_back_to_valid_target_succeeds_and_is_audited(self):
        rfq_id = self._create_rfq(submit=True)  # Operations Review
        response = self.operations.post(
            f"/api/rfq/rfqs/{rfq_id}/send-back/",
            {"actorName": "Ops", "actorRole": "Operations", "targetStage": "Draft", "comment": "Need more detail"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stage"], "Draft")
        last_event = RFQ.objects.get(id=rfq_id).audit_events.first()
        self.assertEqual(last_event.new_status, "Draft")
        self.assertEqual(last_event.comment, "Need more detail")

    def test_send_back_to_invalid_target_is_rejected(self):
        rfq_id = self._create_rfq(submit=True)  # Operations Review — only valid target is Draft
        response = self.operations.post(
            f"/api/rfq/rfqs/{rfq_id}/send-back/",
            {"actorName": "Ops", "actorRole": "Operations", "targetStage": "Controlling"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_from_rejectable_stage_succeeds(self):
        rfq_id = self._create_rfq(submit=True)  # Operations Review — rejectable
        response = self.operations.post(
            f"/api/rfq/rfqs/{rfq_id}/reject/",
            {"actorName": "Ops", "actorRole": "Operations", "reason": "Not feasible"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stage"], "Rejected")

    def test_reject_from_non_rejectable_stage_is_refused(self):
        rfq_id = self._create_rfq()  # Draft is not in REJECTABLE_STAGES
        response = self.sales.post(
            f"/api/rfq/rfqs/{rfq_id}/reject/", {"actorName": "Sales", "actorRole": "Sales", "reason": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    # ---- customers/vendors role-write gating -------------------------------------

    def test_only_sales_or_admin_can_write_customers(self):
        response = self.controlling.post("/api/rfq/customers/", {"code": "CUST-999", "name": "New Co"}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.sales.post("/api/rfq/customers/", {"code": "CUST-999", "name": "New Co"}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_products_are_read_only_for_everyone(self):
        response = self.sales.post("/api/rfq/products/", {"code": "PROD-999", "name": "New pulley"}, format="json")
        self.assertEqual(response.status_code, 405)

    # ---- quotation status update -------------------------------------------------

    def test_quotation_status_won_marks_rfq_won(self):
        rfq_id = self._create_rfq(submit=True)
        self.operations.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")
        item_id = RFQItem.objects.get(rfq_id=rfq_id).id
        self.sourcing.patch(
            f"/api/rfq/rfqs/{rfq_id}/item-sourcing-confirmed/", {"itemId": item_id, "confirmed": True}, format="json"
        )
        self.sourcing.post(f"/api/rfq/rfqs/{rfq_id}/submit-sourcing/", {"actorName": "Sourcing"}, format="json")
        self.controlling.post(
            f"/api/rfq/rfqs/{rfq_id}/cost-breakdown/",
            {"lines": [{"itemId": item_id, "baseCost": 80, "sellingPrice": 100, "finalPrice": 110}]},
            format="json",
        )
        self.controlling.post(f"/api/rfq/rfqs/{rfq_id}/submit-controlling/", {"actorName": "Controlling"}, format="json")
        self.approval.post(f"/api/rfq/rfqs/{rfq_id}/approve-final/", {"actorName": "Approver"}, format="json")
        gen = self.sales.post(f"/api/rfq/rfqs/{rfq_id}/generate-quotation/", {"actorName": "Sales"}, format="json")
        quotation_id = gen.data["id"]

        response = self.sales.patch(
            f"/api/rfq/quotations/{quotation_id}/status/", {"status": "Won", "actorName": "Sales"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        rfq = RFQ.objects.get(id=rfq_id)
        self.assertEqual(rfq.stage, "Won")
        self.assertEqual(rfq.status, "Won")
