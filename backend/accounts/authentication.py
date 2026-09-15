from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import Role, User


class DemoRoleAuthentication(BaseAuthentication):
    """
    Temporary bridge for this phase of the build: the frontend has no real login yet
    (it's an instant "pick a role card" demo-login, per DEMO_PERSONA in mockSeed.ts),
    so there are no real credentials to authenticate with. A request carrying an
    `X-Demo-Role` header authenticates as a standing demo user for that role, which
    still lets the backend's real role-based permission checks (Controlling/Admin
    only may write) work correctly against the app's existing demo roles.

    Replace this with real authentication once the RFQ workflow itself migrates to
    the backend and users have real accounts.
    """

    def authenticate(self, request):
        role = request.headers.get("X-Demo-Role")
        if not role:
            return None
        if role not in Role.values:
            raise AuthenticationFailed(f"Unknown demo role: {role}")
        user, _ = User.objects.get_or_create(
            username=f"demo-{role.lower().replace(' ', '-')}",
            defaults={"role": role, "first_name": role},
        )
        if user.role != role:
            user.role = role
            user.save(update_fields=["role"])
        return (user, None)
