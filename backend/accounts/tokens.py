"""Sign-in tokens: a short-lived access token plus a longer-lived refresh token (simplejwt).

Lifetimes are SIMPLE_JWT in config/settings.py (15 minutes / 7 days by default).

- login_view issues a pair for each sign-in, so every browser has its own tokens and one
  browser signing out never signs out another one using the same account.
- POST /api/auth/refresh/ {refresh} -> {access, refresh}: a new pair. The refresh token sent
  is retired (blacklisted), so each one works once.
- logout retires only that browser's refresh token. An access token already handed out keeps
  working until it expires (at most ACCESS_TOKEN_LIFETIME); that is how these tokens work.
- A password reset / change retires every refresh token the user has (sign out everywhere).
"""

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView


def issue_tokens(user) -> dict:
    """A new {access, refresh} pair for one sign-in."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def sign_out_everywhere(user) -> None:
    """Retire every refresh token the user has. Their browsers can't renew their access token,
    so each is signed out once its current access token runs out."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class RefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ — {refresh} -> {access, refresh}. 401 if the refresh token is
    expired, already used, signed out, or its account is gone or deactivated."""

    authentication_classes: list = []  # an expired access token in the header mustn't matter
    permission_classes = [AllowAny]


class LogoutView(APIView):
    """POST /api/auth/logout/ — {refresh}. Signs out this browser only. Needs no access token
    (it may already have expired), and always answers 204 so a sign-out never fails."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw = request.data.get("refresh") if hasattr(request.data, "get") else None
        if isinstance(raw, str) and raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass  # already expired / used / signed out — nothing left to end
        return Response(status=status.HTTP_204_NO_CONTENT)
