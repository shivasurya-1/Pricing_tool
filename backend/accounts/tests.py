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
