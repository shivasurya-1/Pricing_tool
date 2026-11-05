from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import Role

User = get_user_model()


class DemoRoleAuthenticationTests(TestCase):
    """This was the one piece of the system with zero test coverage, despite being
    the riskiest — see the security audit that flagged X-Demo-Role as a real
    unauthenticated backdoor (any direct API caller, not just the browser app, can
    claim any role including Admin with no credentials). Closing that gap requires
    replacing the demo-login model with real per-person auth — tracked separately,
    not fixed here. These tests instead lock in exactly what today's behavior is, so
    a future change to it is a deliberate decision, not an accident."""

    def test_unknown_role_header_is_rejected(self):
        # 403, not 401: DRF downgrades AuthenticationFailed to 403 when no configured
        # authenticator provides a WWW-Authenticate header (none of ours do) — the
        # same quirk already observed live in production for the no-header case.
        client = APIClient()
        client.credentials(HTTP_X_DEMO_ROLE="Superuser")
        response = client.get("/api/rfq/rfqs/")
        self.assertEqual(response.status_code, 403)

    def test_no_role_header_is_unauthenticated(self):
        client = APIClient()
        response = client.get("/api/rfq/rfqs/")
        self.assertIn(response.status_code, (401, 403))

    def test_known_role_header_authenticates_with_zero_credentials(self):
        """Documents the actual gap: no password, no token, nothing but the header
        value itself. This is the exact behavior the audit flagged — a passing test
        here is not an endorsement, it's a tripwire for when auth is redone."""
        client = APIClient()
        client.credentials(HTTP_X_DEMO_ROLE="Admin")
        response = client.get("/api/rfq/rfqs/")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(username="demo-admin")
        self.assertEqual(user.role, Role.ADMIN)

    def test_same_demo_user_is_reused_across_requests(self):
        client = APIClient()
        client.credentials(HTTP_X_DEMO_ROLE="Sales")
        client.get("/api/rfq/rfqs/")
        client.get("/api/rfq/rfqs/")
        self.assertEqual(User.objects.filter(username="demo-sales").count(), 1)

    def test_role_with_space_in_name_produces_a_valid_username(self):
        client = APIClient()
        client.credentials(HTTP_X_DEMO_ROLE="Approval Panel")
        response = client.get("/api/rfq/rfqs/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(username="demo-approval-panel").exists())


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


class AuthenticationClassesSettingsTests(TestCase):
    """This is the actual fix for the X-Demo-Role security gap — production must
    never include DemoRoleAuthentication. Tests the pure function directly (see its
    docstring in config/settings.py) rather than the live settings object, since
    DEBUG is fixed at process start and can't be flipped mid-test-run."""

    def test_demo_role_authentication_present_only_in_debug(self):
        from config.settings import build_authentication_classes

        self.assertIn("accounts.authentication.DemoRoleAuthentication", build_authentication_classes(debug=True))
        self.assertNotIn("accounts.authentication.DemoRoleAuthentication", build_authentication_classes(debug=False))

    def test_token_authentication_present_either_way(self):
        from config.settings import build_authentication_classes

        for debug in (True, False):
            self.assertIn("rest_framework.authentication.TokenAuthentication", build_authentication_classes(debug=debug))


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
