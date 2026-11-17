import re
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from .models import Role

User = get_user_model()


class NoPasswordFreeLoginTests(TestCase):
    """The old X-Demo-Role header let any caller act as any role (Admin included) with no
    password. It's gone: only a real username/password login (a token) gets in."""

    def test_demo_role_header_does_not_authenticate(self):
        for role in ("Admin", "Sales", "Approval Panel", "Superuser"):
            client = APIClient()
            client.credentials(HTTP_X_DEMO_ROLE=role)
            self.assertIn(client.get("/api/rfq/rfqs/").status_code, (401, 403))
            self.assertIn(client.get("/api/auth/me/").status_code, (401, 403))
        self.assertFalse(User.objects.filter(username__startswith="demo-").exists())

    def test_no_credentials_is_unauthenticated(self):
        self.assertIn(APIClient().get("/api/rfq/rfqs/").status_code, (401, 403))

    def test_only_token_and_session_authentication_are_configured(self):
        from django.conf import settings

        self.assertEqual(
            settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"],
            ["rest_framework.authentication.TokenAuthentication", "rest_framework.authentication.SessionAuthentication"],
        )
        self.assertNotIn("x-demo-role", settings.CORS_ALLOW_HEADERS)


class LoginAndMeViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("realuser", password="correct-password-123", role=Role.SALES)

    def test_login_with_valid_credentials_returns_a_token(self):
        client = APIClient()
        response = client.post("/api/auth/login/", {"username": "realuser", "password": "correct-password-123"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)
        self.assertEqual(Token.objects.get(user=self.user).key, response.data["token"])

    def test_login_with_wrong_password_is_rejected(self):
        client = APIClient()
        response = client.post("/api/auth/login/", {"username": "realuser", "password": "wrong"}, format="json")
        self.assertEqual(response.status_code, 401)

    def login(self, **body):
        return APIClient().post("/api/auth/login/", {"username": "realuser", "password": "correct-password-123", **body}, format="json")

    def test_login_through_the_matching_role_card(self):
        response = self.login(role="Sales")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "Sales")

    def test_login_through_another_role_card_is_refused(self):
        response = self.login(role="Controlling")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "This account is not a Controlling account.")
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_admin_must_use_the_admin_card_too(self):
        User.objects.create_user("realadmin", password="admin-password-123", role=Role.ADMIN)
        body = {"username": "realadmin", "password": "admin-password-123"}
        self.assertEqual(APIClient().post("/api/auth/login/", {**body, "role": "Sales"}, format="json").status_code, 403)
        self.assertEqual(APIClient().post("/api/auth/login/", {**body, "role": "Admin"}, format="json").status_code, 200)

    def test_unknown_role_card_is_rejected(self):
        self.assertEqual(self.login(role="Superuser").status_code, 400)

    def test_wrong_password_never_reveals_the_role(self):
        response = self.login(password="wrong", role="Controlling")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "Invalid credentials")

    def test_successful_login_records_last_login(self):
        self.assertIsNone(self.user.last_login)
        self.assertEqual(self.login(password="wrong").status_code, 401)
        self.assertEqual(self.login(role="Controlling").status_code, 403)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.last_login)  # failed sign-ins don't count
        self.assertEqual(self.login(role="Sales").status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_inactive_account_cannot_log_in(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.login(role="Sales").status_code, 401)

    def test_me_requires_authentication(self):
        client = APIClient()
        response = client.get("/api/auth/me/")
        self.assertIn(response.status_code, (401, 403))

    def test_me_returns_the_authenticated_users_data(self):
        client = APIClient()
        token = Token.objects.create(user=self.user)
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "realuser")

    def test_logout_deletes_the_token(self):
        client = APIClient()
        token = Token.objects.create(user=self.user)
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Token.objects.filter(user=self.user).exists())
        # The old token no longer works for anything.
        response = client.get("/api/auth/me/")
        self.assertIn(response.status_code, (401, 403))


class UserViewSetTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("realadmin", "admin@example.com", "adminpass123", role=Role.ADMIN)
        self.sales = User.objects.create_user("realsales", password="salespass123", role=Role.SALES)
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.admin).key}")
        self.sales_client = APIClient()
        self.sales_client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.sales).key}")

    def test_non_admin_cannot_list_users(self):
        response = self.sales_client.get("/api/auth/users/")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_list_users(self):
        response = self.admin_client.get("/api/auth/users/")
        self.assertEqual(response.status_code, 200)

    def test_admin_can_create_a_user_with_a_password(self):
        payload = {"username": "newperson", "first_name": "New", "email": "new@example.com", "role": "Sourcing", "password": "a-real-password-1"}
        response = self.admin_client.post("/api/auth/users/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.data)
        created = User.objects.get(username="newperson")
        self.assertTrue(created.check_password("a-real-password-1"))
        self.assertEqual(created.role, "Sourcing")

    def test_non_admin_cannot_create_a_user(self):
        payload = {"username": "hacker", "role": "Admin", "password": "whatever12"}
        response = self.sales_client.post("/api/auth/users/", payload, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="hacker").exists())

    def test_admin_can_change_a_users_role_and_deactivate_them(self):
        response = self.admin_client.patch(f"/api/auth/users/{self.sales.id}/", {"role": "Operations"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.sales.refresh_from_db()
        self.assertEqual(self.sales.role, "Operations")

        response = self.admin_client.patch(f"/api/auth/users/{self.sales.id}/", {"is_active": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.sales.refresh_from_db()
        self.assertFalse(self.sales.is_active)

    def test_username_is_immutable_after_creation(self):
        response = self.admin_client.patch(f"/api/auth/users/{self.sales.id}/", {"username": "renamed"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.sales.refresh_from_db()
        self.assertEqual(self.sales.username, "realsales")

    def test_create_response_never_includes_password(self):
        response = self.admin_client.get(f"/api/auth/users/{self.sales.id}/")
        self.assertNotIn("password", response.data)


def token_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get_or_create(user=user)[0].key}")
    return client


class DefaultRolePermissionsTests(TestCase):
    """A role that was never edited must reproduce the old static matrix exactly."""

    def test_default_grids_equal_the_old_matrix(self):
        from .role_permissions import PERMISSION_ACTIONS, PERMISSION_MODULES, default_role_permissions

        ALL = list(PERMISSION_ACTIONS)
        V = ["view"]
        expected = {
            "Sales": {"Create RFQ": ALL, "Operations Review": [], "Sourcing": [], "Costing": [], "Approval": [], "Masters": V},
            "Operations": {"Create RFQ": [], "Operations Review": ALL, "Sourcing": [], "Costing": [], "Approval": [], "Masters": V},
            "Sourcing": {"Create RFQ": [], "Operations Review": [], "Sourcing": ALL, "Costing": [], "Approval": [], "Masters": V},
            "Controlling": {"Create RFQ": [], "Operations Review": [], "Sourcing": [], "Costing": ALL, "Approval": [], "Masters": V},
            "Approval Panel": {"Create RFQ": [], "Operations Review": [], "Sourcing": [], "Costing": V, "Approval": ALL, "Masters": V},
            "Admin": {module: ALL for module in PERMISSION_MODULES},
        }
        for role in Role.values:
            self.assertEqual(default_role_permissions(role), expected[role], role)

    def test_roles_endpoint_returns_defaults_when_nothing_was_saved(self):
        from .role_permissions import default_role_permissions

        admin = User.objects.create_user("grid-admin", password="adminpass123", role=Role.ADMIN)
        response = token_client(admin).get("/api/auth/roles/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["modules"], ["Create RFQ", "Operations Review", "Sourcing", "Costing", "Approval", "Masters"])
        self.assertEqual(response.data["actions"], ["view", "create", "edit", "delete"])
        self.assertEqual(response.data["roles"], {role: default_role_permissions(role) for role in Role.values})


class RolePermissionEndpointTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("roles-admin", password="adminpass123", role=Role.ADMIN)
        self.superuser = User.objects.create_superuser("roles-super", "super@example.com", "superpass123")
        self.sales = User.objects.create_user("roles-sales", password="salespass123", role=Role.SALES)
        self.admin_client = token_client(self.admin)
        self.sales_client = token_client(self.sales)

    def test_non_admin_cannot_read_or_edit_roles(self):
        from .models import RolePermission

        self.assertEqual(self.sales_client.get("/api/auth/roles/").status_code, 403)
        response = self.sales_client.patch("/api/auth/roles/Sales/", {"permissions": {"Masters": ["view", "edit"]}}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(RolePermission.objects.exists())

    def test_superuser_can_manage_roles(self):
        self.assertEqual(token_client(self.superuser).get("/api/auth/roles/").status_code, 200)

    def test_patch_normalises_and_saves_the_grid(self):
        response = self.admin_client.patch(
            "/api/auth/roles/Approval%20Panel/",
            {"permissions": {"Masters": ["edit", "view", "edit"], "Approval": ["view"]}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        expected = {"Create RFQ": [], "Operations Review": [], "Sourcing": [], "Costing": [], "Approval": ["view"], "Masters": ["view", "edit"]}
        self.assertEqual(response.data, {"role": "Approval Panel", "permissions": expected})
        self.assertEqual(self.admin_client.get("/api/auth/roles/").data["roles"]["Approval Panel"], expected)

    def test_put_is_accepted_too(self):
        response = self.admin_client.put("/api/auth/roles/Sales/", {"permissions": {"Create RFQ": ["view"]}}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["permissions"]["Create RFQ"], ["view"])

    def test_admin_role_cannot_be_edited(self):
        response = self.admin_client.patch("/api/auth/roles/Admin/", {"permissions": {"Masters": ["view"]}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Admin always has full access", str(response.data))

    def test_unknown_role_is_404(self):
        response = self.admin_client.patch("/api/auth/roles/Janitor/", {"permissions": {}}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_invalid_module_or_action_is_400(self):
        for permissions in ({"Payroll": ["view"]}, {"Masters": ["approve"]}, {"Masters": "view"}, ["Masters"]):
            response = self.admin_client.patch("/api/auth/roles/Sales/", {"permissions": permissions}, format="json")
            self.assertEqual(response.status_code, 400, permissions)
        response = self.admin_client.patch("/api/auth/roles/Sales/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_me_and_login_return_the_callers_grid(self):
        from .role_permissions import default_role_permissions, full_access

        self.assertEqual(self.sales_client.get("/api/auth/me/").data["permissions"], default_role_permissions("Sales"))
        response = APIClient().post("/api/auth/login/", {"username": "roles-sales", "password": "salespass123"}, format="json")
        self.assertEqual(response.data["user"]["permissions"], default_role_permissions("Sales"))
        self.assertEqual(token_client(self.superuser).get("/api/auth/me/").data["permissions"], full_access())

        self.admin_client.patch("/api/auth/roles/Sales/", {"permissions": {"Masters": ["view"]}}, format="json")
        self.assertEqual(self.sales_client.get("/api/auth/me/").data["permissions"]["Create RFQ"], [])


class RolePermissionEnforcementTests(TestCase):
    """Ticking/unticking a box changes access on a real endpoint from the next request."""

    def setUp(self):
        self.admin = User.objects.create_user("enf-admin", password="adminpass123", role=Role.ADMIN)
        self.superuser = User.objects.create_superuser("enf-super", "s@example.com", "superpass123")
        self.sourcing = User.objects.create_user("enf-sourcing", password="sourcingpass1", role=Role.SOURCING)
        self.sales = User.objects.create_user("enf-sales", password="salespass123", role=Role.SALES)
        self.admin_client = token_client(self.admin)
        self.sourcing_client = token_client(self.sourcing)

    def save_grid(self, role, permissions):
        response = self.admin_client.patch(f"/api/auth/roles/{role}/", {"permissions": permissions}, format="json")
        self.assertEqual(response.status_code, 200)

    def schedule_body(self, client):
        data = client.get("/api/delivery-schedule/").data
        rows = [{k: r[k] for k in ("id", "sourcing", "std_days", "override_days")} for r in data["activities"]]
        return {"safety_factor": data["safety_factor"], "activities": rows}

    def test_unticking_sourcing_edit_blocks_the_delivery_schedule_save(self):
        body = self.schedule_body(self.sourcing_client)
        self.assertEqual(self.sourcing_client.patch("/api/delivery-schedule/", body, format="json").status_code, 200)

        self.save_grid("Sourcing", {"Sourcing": ["view", "create", "delete"], "Masters": ["view"]})
        self.assertEqual(self.sourcing_client.patch("/api/delivery-schedule/", body, format="json").status_code, 403)
        self.assertEqual(self.sourcing_client.post("/api/delivery-schedule/reset/").status_code, 403)
        self.assertEqual(self.sourcing_client.get("/api/delivery-schedule/").status_code, 200)

        self.save_grid("Sourcing", {"Sourcing": ["view", "create", "edit", "delete"], "Masters": ["view"]})
        self.assertEqual(self.sourcing_client.patch("/api/delivery-schedule/", body, format="json").status_code, 200)

    def test_unticking_view_blocks_reading_the_delivery_schedule(self):
        self.save_grid("Sourcing", {})
        self.assertEqual(self.sourcing_client.get("/api/delivery-schedule/").status_code, 403)

    def test_ticking_masters_create_grants_a_master_data_write(self):
        sales_client = token_client(self.sales)
        self.assertEqual(sales_client.post("/api/formulas/sections/", {"label": "Sales Section"}, format="json").status_code, 403)
        self.save_grid("Sales", {"Create RFQ": ["view", "create", "edit", "delete"], "Masters": ["view", "create"]})
        self.assertNotEqual(sales_client.post("/api/formulas/sections/", {"label": "Sales Section"}, format="json").status_code, 403)

    def test_admin_and_superuser_are_never_locked_out(self):
        # Every non-admin role stripped bare; Admin's own grid can't be saved at all.
        for role in ("Sales", "Operations", "Sourcing", "Controlling", "Approval Panel"):
            self.save_grid(role, {})
        for client in (self.admin_client, token_client(self.superuser)):
            body = self.schedule_body(client)
            self.assertEqual(client.patch("/api/delivery-schedule/", body, format="json").status_code, 200)
            self.assertEqual(client.get("/api/auth/roles/").status_code, 200)
            self.assertEqual(client.get("/api/auth/users/").status_code, 200)

    def test_inactive_user_gets_no_access(self):
        from .role_permissions import has_permission

        self.sourcing.is_active = False
        self.sourcing.save()
        self.assertFalse(has_permission(self.sourcing, "Sourcing", "edit"))


class NewUserEmailTests(TestCase):
    """Add User: email is mandatory and the new user is emailed their login details."""

    def setUp(self):
        admin = User.objects.create_user("mail-admin", password="adminpass123", role=Role.ADMIN)
        self.admin_client = token_client(admin)
        self.payload = {"username": "newmailuser", "first_name": "New", "email": "new.user@example.com", "role": "Sourcing", "password": "a-real-password-1"}

    def test_email_is_required(self):
        from django.core import mail

        for email in (None, ""):
            payload = {k: v for k, v in self.payload.items() if k != "email"}
            if email is not None:
                payload["email"] = email
            response = self.admin_client.post("/api/auth/users/", payload, format="json")
            self.assertEqual(response.status_code, 400, email)
            self.assertIn("email", response.data)
        self.assertFalse(User.objects.filter(username="newmailuser").exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_new_user_is_emailed_username_password_and_role(self):
        from django.core import mail

        response = self.admin_client.post("/api/auth/users/", self.payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_sent"])
        self.assertNotIn("password", response.data)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["new.user@example.com"])
        for text in ("Username: newmailuser", "Password: a-real-password-1", "Role: Sourcing"):
            self.assertIn(text, message.body)
        # HTML version of the same template.
        html, mimetype = message.alternatives[0]
        self.assertEqual(mimetype, "text/html")
        for text in ("newmailuser", "a-real-password-1", "Sourcing", "Hello New"):
            self.assertIn(text, html)

    def test_user_is_still_created_when_the_email_fails(self):
        from unittest import mock

        with (
            mock.patch("accounts.email.EmailMultiAlternatives.send", side_effect=OSError("SMTP down")),
            self.assertLogs("accounts.email", level="ERROR") as logs,
        ):
            response = self.admin_client.post("/api/auth/users/", self.payload, format="json")
        self.assertIn("Couldn't send the new-account email", logs.output[0])
        self.assertEqual(response.status_code, 201)
        self.assertFalse(response.data["email_sent"])
        self.assertTrue(User.objects.get(username="newmailuser").check_password("a-real-password-1"))


class UserDeleteTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("del-admin", password="adminpass123", role=Role.ADMIN)
        self.sales = User.objects.create_user("del-sales", password="salespass123", role=Role.SALES)
        self.admin_client = token_client(self.admin)

    def test_admin_can_delete_a_user_and_their_token_goes_too(self):
        sales_client = token_client(self.sales)
        response = self.admin_client.delete(f"/api/auth/users/{self.sales.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.sales.pk).exists())
        self.assertIn(sales_client.get("/api/auth/me/").status_code, (401, 403))

    def test_records_the_user_touched_are_kept(self):
        from formulas.models import FormulaDefinition

        formula = FormulaDefinition.objects.create(key="delTest", label="Delete Test", section="Test", expression="1", updated_by=self.sales)
        self.assertEqual(self.admin_client.delete(f"/api/auth/users/{self.sales.id}/").status_code, 204)
        formula.refresh_from_db()
        self.assertIsNone(formula.updated_by)

    def test_non_admin_cannot_delete(self):
        response = token_client(self.sales).delete(f"/api/auth/users/{self.admin.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_cannot_delete_your_own_account(self):
        response = self.admin_client.delete(f"/api/auth/users/{self.admin.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("own account", str(response.data))
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_admin_can_delete_another_admin(self):
        other = User.objects.create_user("del-admin-2", password="adminpass123", role=Role.ADMIN)
        self.assertEqual(self.admin_client.delete(f"/api/auth/users/{other.id}/").status_code, 204)

    def test_unknown_user_is_404(self):
        self.assertEqual(self.admin_client.delete("/api/auth/users/999999/").status_code, 404)


@override_settings(FRONTEND_URL="https://app.example.test")
class PasswordResetTests(TestCase):
    """Forgot password -> emailed link -> choose a new password."""

    FORGOT = "/api/auth/forgot-password/"
    CHECK = "/api/auth/reset-password/check/"
    RESET = "/api/auth/reset-password/"

    def setUp(self):
        cache.clear()  # the reset endpoints are rate limited per address; keep tests independent
        self.user = User.objects.create_user("rita", email="rita@example.test", password="Old-pass-1234", role=Role.SALES)
        self.client = APIClient()
        # Capture what the view would email. (Rendering the email templates inside a test-client
        # request trips a Django/Python 3.14 template-copy bug that only the test client has, so
        # the email itself is tested separately in test_the_email_renders_with_the_link.)
        self.sent = []
        patcher = patch("accounts.views.send_password_reset_email", side_effect=lambda user, url, minutes: self.sent.append((user, url, minutes)) or True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def link_from_outbox(self):
        self.assertEqual(len(self.sent), 1)
        match = re.search(r"/reset-password\?uid=([^&\s]+)&token=([^\s]+)", self.sent[0][1])
        self.assertIsNotNone(match, self.sent[0][1])
        return match.group(1), match.group(2)

    def request_link(self):
        self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json")
        return self.link_from_outbox()

    # --- forgot password ---

    def test_known_email_gets_a_link(self):
        res = self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json")
        self.assertEqual(res.status_code, 200)
        user, url, minutes = self.sent[0]
        self.assertEqual(user.pk, self.user.pk)
        self.assertTrue(url.startswith("https://app.example.test/reset-password?uid="), url)
        self.assertEqual(minutes, 60)

    def test_the_email_renders_with_the_link(self):
        from .email import send_password_reset_email

        url = "https://app.example.test/reset-password?uid=abc&token=def"
        self.assertTrue(send_password_reset_email(self.user, url, 60))
        message = mail.outbox[0]
        self.assertEqual(message.to, ["rita@example.test"])
        self.assertIn("Reset your", message.subject)
        self.assertIn(url, message.body)
        self.assertIn("rita", message.body)
        self.assertIn("60 minutes", message.body)
        self.assertIn(url.replace("&", "&amp;"), message.alternatives[0][0])  # the HTML version carries the link too (& escaped)

    def test_answer_is_the_same_for_unknown_and_known_emails(self):
        known = self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json")
        unknown = self.client.post(self.FORGOT, {"email": "nobody@example.test"}, format="json")
        self.assertEqual((known.status_code, known.data), (unknown.status_code, unknown.data))
        self.assertEqual(len(self.sent), 1)  # only the real account got an email

    def test_email_match_ignores_case_and_inactive_accounts_get_nothing(self):
        self.client.post(self.FORGOT, {"email": "RITA@Example.TEST"}, format="json")
        self.assertEqual(len(self.sent), 1)
        self.sent.clear()
        self.user.is_active = False
        self.user.save()
        self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json")
        self.assertEqual(len(self.sent), 0)

    def test_missing_or_malformed_email_is_a_400(self):
        for body in ({}, {"email": ""}, {"email": "not-an-email"}):
            self.assertEqual(self.client.post(self.FORGOT, body, format="json").status_code, 400)

    def test_a_stale_token_in_the_request_does_not_break_it(self):
        self.client.credentials(HTTP_AUTHORIZATION="Token not-a-real-token")
        self.assertEqual(self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json").status_code, 200)

    def test_requests_are_rate_limited(self):
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"password_reset": "2/hour"}):
            codes = [self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json").status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])

    # --- the link ---

    def test_a_fresh_link_checks_out_and_a_bad_one_does_not(self):
        uid, token = self.request_link()
        self.assertEqual(self.client.post(self.CHECK, {"uid": uid, "token": token}, format="json").status_code, 200)
        for bad in ({"uid": uid, "token": "wrong"}, {"uid": "zzzz", "token": token}, {"uid": "", "token": ""}, {}):
            self.assertEqual(self.client.post(self.CHECK, bad, format="json").status_code, 400)

    def test_a_link_expires(self):
        uid, token = self.request_link()
        with override_settings(PASSWORD_RESET_TIMEOUT=-1):
            res = self.client.post(self.CHECK, {"uid": uid, "token": token}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("expired", res.data["detail"])

    # --- choosing the new password ---

    def test_reset_sets_the_new_password_and_the_link_works_once(self):
        uid, token = self.request_link()
        res = self.client.post(self.RESET, {"uid": uid, "token": token, "password": "Brand-new-pass-77"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        login = lambda pw: self.client.post("/api/auth/login/", {"username": "rita", "password": pw}, format="json").status_code
        self.assertEqual(login("Brand-new-pass-77"), 200)
        self.assertEqual(login("Old-pass-1234"), 401)
        again = self.client.post(self.RESET, {"uid": uid, "token": token, "password": "Another-pass-88"}, format="json")
        self.assertEqual(again.status_code, 400)  # the link died with the old password

    def test_reset_signs_out_every_existing_session(self):
        old_token = Token.objects.create(user=self.user)
        uid, token = self.request_link()
        self.client.post(self.RESET, {"uid": uid, "token": token, "password": "Brand-new-pass-77"}, format="json")
        self.assertFalse(Token.objects.filter(key=old_token.key).exists())

    def test_weak_passwords_are_refused_with_every_reason(self):
        uid, token = self.request_link()
        res = self.client.post(self.RESET, {"uid": uid, "token": token, "password": "12345678"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(res.data["errors"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Old-pass-1234"))  # nothing changed
        # the link still works after a refused password
        ok = self.client.post(self.RESET, {"uid": uid, "token": token, "password": "Brand-new-pass-77"}, format="json")
        self.assertEqual(ok.status_code, 200)

    def test_reset_needs_a_valid_link_and_a_password(self):
        uid, token = self.request_link()
        self.assertEqual(self.client.post(self.RESET, {"uid": uid, "token": "wrong", "password": "Brand-new-pass-77"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.RESET, {"uid": uid, "token": token}, format="json").status_code, 400)

    def test_a_link_for_one_account_cannot_reset_another(self):
        other = User.objects.create_user("omar", email="omar@example.test", password="Omar-pass-1234")
        _, token = self.request_link()
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        other_uid = urlsafe_base64_encode(force_bytes(other.pk))
        res = self.client.post(self.RESET, {"uid": other_uid, "token": token, "password": "Brand-new-pass-77"}, format="json")
        self.assertEqual(res.status_code, 400)
        other.refresh_from_db()
        self.assertTrue(other.check_password("Omar-pass-1234"))

    @override_settings(FRONTEND_URL="")
    def test_without_a_frontend_url_no_email_is_sent_but_the_answer_is_unchanged(self):
        res = self.client.post(self.FORGOT, {"email": "rita@example.test"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(self.sent), 0)


class ChangePasswordTests(TestCase):
    """A signed-in user changing their own password (no email link involved)."""

    URL = "/api/auth/change-password/"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user("carl", email="carl@example.test", password="Old-pass-1234", role=Role.SALES)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def change(self, current="Old-pass-1234", new="Brand-new-pass-77"):
        return self.client.post(self.URL, {"current_password": current, "new_password": new}, format="json")

    def login_status(self, password):
        return APIClient().post("/api/auth/login/", {"username": "carl", "password": password}, format="json").status_code

    def test_requires_sign_in(self):
        res = APIClient().post(self.URL, {"current_password": "x", "new_password": "y"}, format="json")
        self.assertIn(res.status_code, (401, 403))

    def test_changes_the_password(self):
        res = self.change()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.login_status("Brand-new-pass-77"), 200)
        self.assertEqual(self.login_status("Old-pass-1234"), 401)

    def test_this_browser_stays_signed_in_and_other_sessions_end(self):
        res = self.change()
        self.assertFalse(Token.objects.filter(key=self.token.key).exists())  # the old key is dead
        new_key = res.data["token"]
        self.assertTrue(Token.objects.filter(key=new_key, user=self.user).exists())
        fresh = APIClient()
        fresh.credentials(HTTP_AUTHORIZATION=f"Token {new_key}")
        self.assertEqual(fresh.get("/api/auth/me/").status_code, 200)

    def test_wrong_current_password_is_a_400_not_a_401(self):
        res = self.change(current="Not-my-password-1")
        self.assertEqual(res.status_code, 400)  # a 401 would sign the user out in the frontend
        self.assertIn("current password", res.data["detail"])
        self.assertEqual(self.login_status("Old-pass-1234"), 200)  # nothing changed

    def test_weak_and_unchanged_passwords_are_refused(self):
        weak = self.change(new="12345678")
        self.assertEqual(weak.status_code, 400)
        self.assertTrue(weak.data["errors"])
        same = self.change(new="Old-pass-1234")
        self.assertEqual(same.status_code, 400)
        self.assertEqual(self.login_status("Old-pass-1234"), 200)

    def test_missing_fields_are_a_400(self):
        self.assertEqual(self.client.post(self.URL, {}, format="json").status_code, 400)
        self.assertEqual(self.client.post(self.URL, {"current_password": "Old-pass-1234"}, format="json").status_code, 400)

    def test_attempts_are_rate_limited(self):
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", {"password_change": "2/hour"}):
            codes = [self.change(current="wrong-one-1").status_code for _ in range(3)]
        self.assertEqual(codes, [400, 400, 429])
