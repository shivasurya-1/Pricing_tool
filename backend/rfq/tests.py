from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from django.test import TestCase

from accounts.models import User
from reference.models import OrganizationSettings
from .models import Customer, CostBreakdownLine, Product, Quotation, RFQ, RFQAttachment, RFQItem


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

    # ---- products CRUD ------------------------------------------------------------

    def test_only_controlling_or_admin_can_write_products(self):
        response = self.sales.post("/api/rfq/products/", {"code": "PROD-999", "name": "New pulley", "unit": "Nos"}, format="json")
        self.assertEqual(response.status_code, 403)
        response = self.controlling.post("/api/rfq/products/", {"code": "PROD-999", "name": "New pulley", "unit": "Nos"}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_anyone_authenticated_can_read_products(self):
        response = self.sales.get("/api/rfq/products/")
        self.assertEqual(response.status_code, 200)

    def test_product_can_be_updated_and_deleted(self):
        created = self.controlling.post("/api/rfq/products/", {"code": "PROD-998", "name": "Temp pulley", "unit": "Nos"}, format="json")
        product_id = created.data["id"]

        response = self.controlling.patch(f"/api/rfq/products/{product_id}/", {"name": "Renamed pulley"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Renamed pulley")

        response = self.controlling.delete(f"/api/rfq/products/{product_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Product.objects.filter(id=product_id).exists())

    def test_deleting_a_product_still_used_by_an_rfq_item_is_rejected(self):
        self._create_rfq()  # uses self.product
        response = self.controlling.delete(f"/api/rfq/products/{self.product.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Product.objects.filter(id=self.product.id).exists())

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


class RFQWorkflowSecurityRegressionTests(TestCase):
    """Every action that mutates an RFQ must reject a caller whose role doesn't own
    the RFQ's current stage — these previously had no such check at all. Regression
    coverage for the audit finding, not just the happy path already covered above."""

    def setUp(self):
        self.customer = Customer.objects.create(id="cust-2", code="CUST-002", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-2", code="PROD-2", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        self.operations = client_as("Operations")
        self.sourcing = client_as("Sourcing")
        self.controlling = client_as("Controlling")

        create = self.sales.post(
            "/api/rfq/rfqs/",
            {"customerId": self.customer.id, "actorName": "Sales", "submit": True, "items": [{"productId": self.product.id, "quantity": 1, "targetPrice": 100}]},
            format="json",
        )
        self.rfq_id = create.data["id"]  # now in Operations Review
        self.item_id = create.data["items"][0]["id"]

    def test_wrong_role_cannot_save_operations_review(self):
        response = self.sales.patch(f"/api/rfq/rfqs/{self.rfq_id}/operations-review/", {"review": {}}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_wrong_role_cannot_edit_item_tech_data(self):
        response = self.sourcing.patch(
            f"/api/rfq/rfqs/{self.rfq_id}/item-tech-data/", {"itemId": self.item_id, "technicalData": {"shellOD": 999}}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_wrong_role_cannot_confirm_item_sourcing(self):
        # Still in Operations Review, not Sourcing yet — Sourcing itself is the wrong stage here.
        response = self.sourcing.patch(
            f"/api/rfq/rfqs/{self.rfq_id}/item-sourcing-confirmed/", {"itemId": self.item_id, "confirmed": True}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_wrong_role_cannot_save_cost_breakdown(self):
        # Sales trying to set its own selling price while the RFQ sits in Operations
        # Review — this is exactly the "Sales overrides Controlling's pricing" gap.
        response = self.sales.post(
            f"/api/rfq/rfqs/{self.rfq_id}/cost-breakdown/",
            {"lines": [{"itemId": self.item_id, "baseCost": 1, "sellingPrice": 999999, "finalPrice": 999999}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CostBreakdownLine.objects.filter(item_id=self.item_id).exists())

    def test_wrong_role_cannot_send_back(self):
        response = self.sales.post(
            f"/api/rfq/rfqs/{self.rfq_id}/send-back/",
            {"actorName": "Sales", "targetStage": "Draft", "comment": "trying to send back my own RFQ"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_wrong_role_cannot_reject(self):
        response = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/reject/", {"actorName": "Sales", "reason": "x"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_client_supplied_actor_role_does_not_reach_the_audit_trail(self):
        """A client authenticated as Operations claiming actorRole=Admin (or anything
        else) must not get that fabricated role written into the permanent audit log —
        only the real authenticated role can ever be recorded."""
        response = self.operations.post(
            f"/api/rfq/rfqs/{self.rfq_id}/send-back/",
            {"actorName": "Fake Admin", "actorRole": "Admin", "targetStage": "Draft", "comment": "spoofed role"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        event = RFQ.objects.get(id=self.rfq_id).audit_events.first()
        self.assertEqual(event.role, "Operations")
        self.assertNotEqual(event.role, "Admin")


class RFQAttachmentTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(id="cust-3", code="CUST-003", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-3", code="PROD-3", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        self.operations = client_as("Operations")

        create = self.sales.post(
            "/api/rfq/rfqs/",
            {"customerId": self.customer.id, "actorName": "Sales", "submit": False, "items": [{"productId": self.product.id, "quantity": 1, "targetPrice": 100}]},
            format="json",
        )
        self.rfq_id = create.data["id"]  # Draft — Sales owns this stage

    def _pdf(self, name="drawing.pdf", content=b"%PDF-1.4 fake"):
        return SimpleUploadedFile(name, content, content_type="application/pdf")

    def test_upload_succeeds_and_appears_on_the_rfq(self):
        response = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": self._pdf()}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(response.data["attachments"]), 1)
        self.assertEqual(response.data["attachments"][0]["name"], "drawing.pdf")

    def test_wrong_role_cannot_upload(self):
        response = self.operations.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": self._pdf()}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(RFQAttachment.objects.filter(rfq_id=self.rfq_id).count(), 0)

    def test_disallowed_extension_is_rejected(self):
        bad_file = SimpleUploadedFile("virus.exe", b"MZ fake exe", content_type="application/octet-stream")
        response = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": bad_file}, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(RFQAttachment.objects.filter(rfq_id=self.rfq_id).count(), 0)

    def test_oversized_file_is_rejected(self):
        from .models import MAX_ATTACHMENT_SIZE_BYTES

        huge = SimpleUploadedFile("big.pdf", b"0" * (MAX_ATTACHMENT_SIZE_BYTES + 1), content_type="application/pdf")
        response = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": huge}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_attachment_count_cap_is_enforced(self):
        from .models import MAX_ATTACHMENTS_PER_RFQ

        rfq = RFQ.objects.get(id=self.rfq_id)
        for i in range(MAX_ATTACHMENTS_PER_RFQ):
            RFQAttachment.objects.create(rfq=rfq, file=self._pdf(f"f{i}.pdf"), original_filename=f"f{i}.pdf", size_bytes=10)
        response = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": self._pdf("one_too_many.pdf")}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_download_returns_the_file_with_the_original_filename(self):
        upload = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": self._pdf(content=b"hello world")}, format="multipart")
        attachment_id = upload.data["attachments"][0]["id"]
        response = self.sales.get(f"/api/rfq/rfqs/{self.rfq_id}/attachments/{attachment_id}/download/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"hello world")
        self.assertIn("drawing.pdf", response["Content-Disposition"])

    def test_delete_removes_the_row_and_the_file_from_storage(self):
        upload = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/attachments/", {"file": self._pdf()}, format="multipart")
        attachment_id = upload.data["attachments"][0]["id"]
        attachment = RFQAttachment.objects.get(id=attachment_id)
        storage = attachment.file.storage
        stored_name = attachment.file.name
        self.assertTrue(storage.exists(stored_name))

        response = self.sales.delete(f"/api/rfq/rfqs/{self.rfq_id}/attachments/{attachment_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["attachments"]), 0)
        self.assertFalse(RFQAttachment.objects.filter(id=attachment_id).exists())
        self.assertFalse(storage.exists(stored_name))


class QuotationPdfTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(id="cust-4", code="CUST-004", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-4", code="PROD-4", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        self.operations = client_as("Operations")
        self.sourcing = client_as("Sourcing")
        self.controlling = client_as("Controlling")
        self.approval = client_as("Approval Panel")

        create = self.sales.post(
            "/api/rfq/rfqs/",
            {"customerId": self.customer.id, "actorName": "Sales", "submit": True, "items": [{"productId": self.product.id, "quantity": 2, "targetPrice": 100}]},
            format="json",
        )
        rfq_id = create.data["id"]
        item_id = create.data["items"][0]["id"]
        self.operations.post(f"/api/rfq/rfqs/{rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")
        self.sourcing.patch(f"/api/rfq/rfqs/{rfq_id}/item-sourcing-confirmed/", {"itemId": item_id, "confirmed": True}, format="json")
        self.sourcing.post(f"/api/rfq/rfqs/{rfq_id}/submit-sourcing/", {"actorName": "Sourcing"}, format="json")
        self.controlling.post(
            f"/api/rfq/rfqs/{rfq_id}/cost-breakdown/",
            {"lines": [{"itemId": item_id, "baseCost": 80, "sellingPrice": 100, "finalPrice": 220}]},
            format="json",
        )
        self.controlling.post(f"/api/rfq/rfqs/{rfq_id}/submit-controlling/", {"actorName": "Controlling"}, format="json")
        self.approval.post(f"/api/rfq/rfqs/{rfq_id}/approve-final/", {"actorName": "Approver"}, format="json")
        gen = self.sales.post(f"/api/rfq/rfqs/{rfq_id}/generate-quotation/", {"actorName": "Sales"}, format="json")
        self.quotation_id = gen.data["id"]

    def test_pdf_download_returns_a_real_pdf(self):
        response = self.sales.get(f"/api/rfq/quotations/{self.quotation_id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertGreater(len(response.content), 1000)

    def test_any_authenticated_role_can_download(self):
        response = self.operations.get(f"/api/rfq/quotations/{self.quotation_id}/pdf/")
        self.assertEqual(response.status_code, 200)

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().get(f"/api/rfq/quotations/{self.quotation_id}/pdf/")
        self.assertIn(response.status_code, (401, 403))


class QuotationEmailTests(TestCase):
    def setUp(self):
        self.customer = Customer.objects.create(id="cust-5", code="CUST-005", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-5", code="PROD-5", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        self.operations = client_as("Operations")
        self.sourcing = client_as("Sourcing")
        self.controlling = client_as("Controlling")
        self.approval = client_as("Approval Panel")

        create = self.sales.post(
            "/api/rfq/rfqs/",
            {"customerId": self.customer.id, "actorName": "Sales", "submit": True, "contactEmail": "buyer@example.com", "items": [{"productId": self.product.id, "quantity": 2, "targetPrice": 100}]},
            format="json",
        )
        self.rfq_id = create.data["id"]
        item_id = create.data["items"][0]["id"]
        self.operations.post(f"/api/rfq/rfqs/{self.rfq_id}/approve-operations/", {"actorName": "Ops"}, format="json")
        self.sourcing.patch(f"/api/rfq/rfqs/{self.rfq_id}/item-sourcing-confirmed/", {"itemId": item_id, "confirmed": True}, format="json")
        self.sourcing.post(f"/api/rfq/rfqs/{self.rfq_id}/submit-sourcing/", {"actorName": "Sourcing"}, format="json")
        self.controlling.post(
            f"/api/rfq/rfqs/{self.rfq_id}/cost-breakdown/",
            {"lines": [{"itemId": item_id, "baseCost": 80, "sellingPrice": 100, "finalPrice": 220}]},
            format="json",
        )
        self.controlling.post(f"/api/rfq/rfqs/{self.rfq_id}/submit-controlling/", {"actorName": "Controlling"}, format="json")
        self.approval.post(f"/api/rfq/rfqs/{self.rfq_id}/approve-final/", {"actorName": "Approver"}, format="json")
        gen = self.sales.post(f"/api/rfq/rfqs/{self.rfq_id}/generate-quotation/", {"actorName": "Sales"}, format="json")
        self.quotation_id = gen.data["id"]

    def test_send_email_delivers_a_pdf_to_the_contact_email(self):
        response = self.sales.post(f"/api/rfq/quotations/{self.quotation_id}/send-email/", {"actorName": "Sales"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["buyer@example.com"])
        self.assertEqual(len(sent.attachments), 1)
        filename, content, mimetype = sent.attachments[0]
        self.assertTrue(filename.endswith(".pdf"))
        self.assertEqual(mimetype, "application/pdf")
        self.assertTrue(content.startswith(b"%PDF"))

    def test_send_email_without_a_contact_email_is_rejected(self):
        rfq = RFQ.objects.get(id=self.rfq_id)
        rfq.contact_email = ""
        rfq.save(update_fields=["contact_email"])
        response = self.sales.post(f"/api/rfq/quotations/{self.quotation_id}/send-email/", {"actorName": "Sales"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_unauthenticated_request_is_rejected(self):
        response = APIClient().post(f"/api/rfq/quotations/{self.quotation_id}/send-email/", {}, format="json")
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(len(mail.outbox), 0)


class StageChangeNotificationEmailTests(TestCase):
    """append_notification() (views.py) fires notify_role_by_email for every
    target_role it's given — this covers the 9 existing call sites via one of them
    (submit), since they all go through the same function."""

    def setUp(self):
        self.customer = Customer.objects.create(id="cust-6", code="CUST-006", name="Acme Pulleys")
        self.product = Product.objects.create(id="prod-6", code="PROD-6", name="6 inch pulley", unit="Nos")
        self.sales = client_as("Sales")
        User.objects.create_user("ops-notify", password="opspass123", role="Operations", email="ops@example.com")

    def _create_draft_rfq(self):
        response = self.sales.post(
            "/api/rfq/rfqs/",
            {"customerId": self.customer.id, "actorName": "Sales", "submit": False, "items": [{"productId": self.product.id, "quantity": 1, "targetPrice": 100}]},
            format="json",
        )
        return response.data["id"]

    def test_no_email_sent_when_notifications_are_disabled(self):
        rfq_id = self._create_draft_rfq()
        self.sales.post(f"/api/rfq/rfqs/{rfq_id}/submit/", {"actorName": "Sales"}, format="json")
        self.assertEqual(len(mail.outbox), 0)

    def test_emails_every_active_user_with_the_target_role_when_enabled(self):
        settings_obj = OrganizationSettings.load()
        settings_obj.notify_email_enabled = True
        settings_obj.save()

        rfq_id = self._create_draft_rfq()
        self.sales.post(f"/api/rfq/rfqs/{rfq_id}/submit/", {"actorName": "Sales"}, format="json")

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["ops@example.com"])
