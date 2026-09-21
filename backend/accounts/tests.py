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
