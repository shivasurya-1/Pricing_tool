"""Scratch-only reproduction tests for the Part C findings register.

Each test asserts the CURRENT behaviour. A passing test means the finding is reproduced.
Runs against Django's throwaway test database via the test client — never against a live site.
Run from backend/:  DJANGO_SETTINGS_MODULE=scratch_settings python manage.py test findings_tests
"""

from django.contrib import admin
from django.core import mail
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from accounts.models import User
from formulas.evaluator import FormulaError, evaluate_formula
from rfq.models import AuditEvent, AppNotification, Customer, Product, Quotation, RFQ, RFQItem
from rfq.pdf import build_quotation_pdf


def client_for(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
    return c


class Base(TestCase):
    def setUp(self):
        self.users = {
            r: User.objects.create_user(username=r.lower().replace(" ", "_"), password="Pw-test-12345", role=r, email=f"{r[:3].lower()}@example.test")
            for r in ["Sales", "Operations", "Sourcing", "Controlling", "Approval Panel"]
        }
        self.customer = Customer.objects.create(code="C1", name="[Customer]", email="customer@example.test")
        self.product = Product.objects.create(code="P1", name="Drum pulley")

    def make_rfq(self, stage):
        rfq = RFQ.objects.create(id=f"rfq-{stage.lower().replace(' ', '-')}", rfq_number=f"RFQ-X-{stage}", customer=self.customer, stage=stage, project_name="Demo")
        RFQItem.objects.create(rfq=rfq, item_no=1, product=self.product, quantity=1)
        return rfq


class LoginOnlyEndpoints(Base):
    """E1-E5: data-changing endpoints with no role or stage check."""

    def test_E1_operations_user_generates_quotation_from_draft(self):
        rfq = self.make_rfq("Draft")
        r = client_for(self.users["Operations"]).post(f"/api/rfq/rfqs/{rfq.id}/generate-quotation/", {"actorName": "x"}, format="json")
        self.assertEqual(r.status_code, 201)
        rfq.refresh_from_db()
        self.assertEqual(rfq.stage, "Quotation Generated")

    def test_E1b_generate_twice_creates_two_quotations(self):
        rfq = self.make_rfq("Approved")
        c = client_for(self.users["Sales"])
        c.post(f"/api/rfq/rfqs/{rfq.id}/generate-quotation/", {}, format="json")
        c.post(f"/api/rfq/rfqs/{rfq.id}/generate-quotation/", {}, format="json")
        self.assertEqual(Quotation.objects.filter(rfq=rfq).count(), 2)

    def test_E2_sourcing_user_marks_quotation_sent_from_operations_review(self):
        rfq = self.make_rfq("Operations Review")
        r = client_for(self.users["Sourcing"]).post(f"/api/rfq/rfqs/{rfq.id}/send-quotation/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        rfq.refresh_from_db()
        self.assertEqual(rfq.stage, "Quotation Sent")

    def test_E3_any_role_sets_won_and_arbitrary_status_text(self):
        rfq = self.make_rfq("Approved")
        q = Quotation.objects.create(quotation_number="Q-1", rfq=rfq)
        c = client_for(self.users["Operations"])
        self.assertEqual(c.patch(f"/api/rfq/quotations/{q.id}/status/", {"status": "Won"}, format="json").status_code, 200)
        rfq.refresh_from_db()
        self.assertEqual(rfq.stage, "Won")
        self.assertEqual(c.patch(f"/api/rfq/quotations/{q.id}/status/", {"status": "NotAStatus"}, format="json").status_code, 200)
        q.refresh_from_db()
        self.assertEqual(q.status, "NotAStatus")
        self.assertEqual(AuditEvent.objects.filter(rfq=rfq).first().role, "Sales")  # role hard-coded

    def test_E4_any_role_emails_customer(self):
        rfq = self.make_rfq("Approved")
        q = Quotation.objects.create(quotation_number="Q-2", rfq=rfq)
        r = client_for(self.users["Operations"]).post(f"/api/rfq/quotations/{q.id}/send-email/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_E5_mark_all_read_affects_every_role(self):
        AppNotification.objects.create(message="for Controlling", target_role="Controlling")
        client_for(self.users["Sales"]).post("/api/rfq/notifications/mark-all-read/", {}, format="json")
        self.assertTrue(AppNotification.objects.get().read)


class BrowserOnlyRules(Base):
    """B1-B5: rules the screens enforce but the API does not."""

    def test_B1_send_back_and_reject_accept_empty_comment_and_reason(self):
        rfq = self.make_rfq("Operations Review")
        c = client_for(self.users["Operations"])
        self.assertEqual(c.post(f"/api/rfq/rfqs/{rfq.id}/send-back/", {"targetStage": "Draft", "comment": ""}, format="json").status_code, 200)
        rfq2 = self.make_rfq("Sourcing")
        r = client_for(self.users["Sourcing"]).post(f"/api/rfq/rfqs/{rfq2.id}/reject/", {"reason": "", "comment": ""}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_B2_approve_operations_without_review_checks(self):
        rfq = self.make_rfq("Operations Review")
        r = client_for(self.users["Operations"]).post(f"/api/rfq/rfqs/{rfq.id}/approve-operations/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        rfq.refresh_from_db()
        self.assertIsNone(rfq.operations_review)

    def test_B4_cost_breakdown_derived_values_stored_as_sent(self):
        rfq = self.make_rfq("Controlling")
        item = rfq.items.get()
        line = {"itemId": item.id, "baseCost": 100, "freight": 0, "duties": 0, "otherCharges": 0, "discount": 0,
                "adjustedCost": 100, "marginPercent": 15, "marginValue": 15, "sellingPrice": 115, "taxPercent": 18,
                "taxValue": 20.7, "finalPrice": 1}  # correct final price would be 135.7
        r = client_for(self.users["Controlling"]).post(f"/api/rfq/rfqs/{rfq.id}/cost-breakdown/", {"lines": [line]}, format="json")
        self.assertEqual(r.status_code, 200)
        rfq.refresh_from_db()
        self.assertEqual(rfq.value, 1.0)

    def test_B5_lost_without_reason(self):
        rfq = self.make_rfq("Quotation Sent")
        q = Quotation.objects.create(quotation_number="Q-3", rfq=rfq)
        r = client_for(self.users["Sales"]).patch(f"/api/rfq/quotations/{q.id}/status/", {"status": "Lost"}, format="json")
        self.assertEqual(r.status_code, 200)
        rfq.refresh_from_db()
        self.assertEqual(rfq.stage, "Lost")
        self.assertIsNone(rfq.loss_reason)


class AuditAndAuth(Base):
    def test_audit_log_readable_by_every_role(self):
        rfq = self.make_rfq("Draft")
        AuditEvent.objects.create(rfq=rfq, user="x", role="Sales", module="RFQ", record="r", action="a")
        r = client_for(self.users["Operations"]).get("/api/rfq/audit-log/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)

    def test_audit_user_name_taken_from_request_body(self):
        rfq = self.make_rfq("Draft")
        client_for(self.users["Sales"]).post(f"/api/rfq/rfqs/{rfq.id}/submit/", {"actorName": "Someone Else"}, format="json")
        self.assertEqual(AuditEvent.objects.filter(rfq=rfq).first().user, "Someone Else")

    def test_audit_events_editable_in_django_admin(self):
        model_admin = admin.site._registry[AuditEvent]
        su = User.objects.create_superuser("root", "root@example.test", "Pw-test-12345")
        request = type("R", (), {"user": su})()
        self.assertTrue(model_admin.has_change_permission(request))
        self.assertTrue(model_admin.has_delete_permission(request))

    def test_token_is_reused_and_has_no_expiry(self):
        c = APIClient()
        body = {"username": "sales", "password": "Pw-test-12345"}
        t1 = c.post("/api/auth/login/", body, format="json").json()["token"]
        t2 = c.post("/api/auth/login/", body, format="json").json()["token"]
        self.assertEqual(t1, t2)

    def test_login_has_no_throttling(self):
        c = APIClient()
        codes = {c.post("/api/auth/login/", {"username": "sales", "password": "wrong"}, format="json").status_code for _ in range(30)}
        self.assertEqual(codes, {401})  # never 429

    def test_new_user_email_contains_plain_password(self):
        admin_user = User.objects.create_user("adm", password="Pw-test-12345", role="Admin")
        r = client_for(admin_user).post("/api/auth/users/", {"username": "newbie", "email": "n@example.test", "role": "Sales", "password": "Tmp-Pass-9876"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIn("Tmp-Pass-9876", mail.outbox[0].body)

    def test_weak_password_accepted_on_user_create(self):
        admin_user = User.objects.create_user("adm2", password="Pw-test-12345", role="Admin")
        r = client_for(admin_user).post("/api/auth/users/", {"username": "weak", "email": "w@example.test", "role": "Sales", "password": "12345678"}, format="json")
        self.assertEqual(r.status_code, 201)  # AUTH_PASSWORD_VALIDATORS not applied by the serializer


class ProtectionsThatWork(Base):
    """Controls verified to work (for balance in the report)."""

    def test_stage_action_rejected_for_wrong_role(self):
        rfq = self.make_rfq("Controlling")
        r = client_for(self.users["Sales"]).post(f"/api/rfq/rfqs/{rfq.id}/submit-controlling/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_send_back_to_invalid_target_rejected(self):
        rfq = self.make_rfq("Operations Review")
        r = client_for(self.users["Operations"]).post(f"/api/rfq/rfqs/{rfq.id}/send-back/", {"targetStage": "Controlling", "comment": "x"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_login_role_mismatch_rejected(self):
        r = APIClient().post("/api/auth/login/", {"username": "sales", "password": "Pw-test-12345", "role": "Admin"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_formula_write_forbidden_for_sales(self):
        r = client_for(self.users["Sales"]).post("/api/formulas/", {"key": "x", "label": "x", "section": "s", "expression": "1", "input_variables": []}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_attachment_bad_extension_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        rfq = self.make_rfq("Draft")
        f = SimpleUploadedFile("x.exe", b"MZ", content_type="application/octet-stream")
        r = client_for(self.users["Sales"]).post(f"/api/rfq/rfqs/{rfq.id}/attachments/", {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_attachment_content_not_checked(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        rfq = self.make_rfq("Draft")
        f = SimpleUploadedFile("drawing.pdf", b"MZ\x90\x00not-a-pdf", content_type="application/pdf")
        r = client_for(self.users["Sales"]).post(f"/api/rfq/rfqs/{rfq.id}/attachments/", {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 201)


class EvaluatorAndPdf(Base):
    def test_no_code_execution(self):
        for expr in ["(1).__class__", "__import__('os')", "eval('1')", "open('x')", "(lambda: 1)()"]:
            with self.assertRaises(FormulaError, msg=expr):
                evaluate_formula(expr, {})

    def test_server_accepts_syntax_the_browser_rejects(self):
        for expr, expected in [("2**3", 8), ("5%2", 1), ("7//2", 3), ("1 if 1 else 2", 1), ("[x for x in [1,2]][0]", 1)]:
            self.assertEqual(evaluate_formula(expr, {}), expected, expr)

    def test_pdf_markup_in_user_text_breaks_pdf(self):
        rfq = self.make_rfq("Approved")
        # User text is parsed as reportlab markup: an <img> tag makes the server open a
        # local path / fetch a URL while building the PDF (here it does not exist, so it fails).
        rfq.project_name = 'Demo <img src="C:/does/not/exist.png" width="10" height="10"/>'
        rfq.save()
        q = Quotation.objects.create(quotation_number="Q-9", rfq=rfq)
        with self.assertRaises(OSError):
            build_quotation_pdf(q, rfq)
        rfq.project_name = "<b>Bold</b> is rendered as markup"
        rfq.save()
        self.assertTrue(build_quotation_pdf(q, rfq).startswith(b"%PDF"))
