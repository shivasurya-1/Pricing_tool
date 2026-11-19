"""Sign-in tokens: a short-lived access token plus a longer-lived refresh token (simplejwt).

Lifetimes are SIMPLE_JWT in config/settings.py (15 minutes / 7 days by default).

- The ACCESS token goes in the JSON body and the browser keeps it in memory only; every API
  call sends it as `Authorization: Bearer <access>`.
- The REFRESH token never appears in a response body. It is set as an httpOnly cookie
  (REFRESH_COOKIE_* settings) that page scripts cannot read, scoped to /api/auth/ so the browser
  sends it only to login, refresh, logout and change-password.
- login_view issues a pair for each sign-in, so every browser has its own tokens and one
  browser signing out never signs out another one using the same account.
- POST /api/auth/refresh/ (cookie) -> {access} plus a new refresh cookie. The refresh token sent
  is retired (blacklisted), so each one works once.
- logout retires only that browser's refresh token and clears the cookie. An access token
  already handed out keeps working until it expires (at most ACCESS_TOKEN_LIFETIME).
- A password reset / change retires every refresh token the user has (sign out everywhere).

"""

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
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


# ---- the refresh-token cookie ---------------------------------------------------------------

def set_refresh_cookie(response: Response, refresh: str) -> Response:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
    return response


def clear_refresh_cookie(response: Response) -> Response:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite=settings.REFRESH_COOKIE_SAMESITE)
    return response


def signed_in_response(user, body: dict, status_code: int = status.HTTP_200_OK) -> Response:
    """`body` plus a fresh access token; the matching refresh token goes in the cookie."""
    tokens = issue_tokens(user)
    return set_refresh_cookie(Response({**body, "access": tokens["access"]}, status=status_code), tokens["refresh"])


def _refresh_from(request) -> str:
    """The refresh token: the httpOnly cookie, or (for API clients without cookies) the body."""
    raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
    if not raw and hasattr(request.data, "get"):
        raw = request.data.get("refresh")
    return raw if isinstance(raw, str) else ""


class RefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ — refresh token from the cookie -> {access} and a new refresh
    cookie. 401 if the refresh token is missing, expired, already used, signed out, or its
    account is gone or deactivated.

    A refused refresh deliberately leaves the cookie alone: when two tabs refresh at the same
    moment, the loser's 401 must not delete the new cookie the winner has just received.
    Logout is what clears it."""

    authentication_classes: list = []  # an expired access token in the header mustn't matter
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data={"refresh": _refresh_from(request)})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            raise InvalidToken(exc.args[0]) from exc
        except (ValidationError, AuthenticationFailed):
            # Missing token, or its account is gone / deactivated.
            return Response({"detail": "Your session has ended. Please sign in again."}, status=status.HTTP_401_UNAUTHORIZED)
        data = serializer.validated_data
        response = Response({"access": data["access"]})
        return set_refresh_cookie(response, data["refresh"]) if data.get("refresh") else response


class LogoutView(APIView):
    """POST /api/auth/logout/ — signs out this browser only: retires the refresh token in the
    cookie and clears it. Needs no access token (it may already have expired), and always
    answers 204 so a sign-out never fails."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        raw = _refresh_from(request)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass  # already expired / used / signed out — nothing left to end
        return clear_refresh_cookie(Response(status=status.HTTP_204_NO_CONTENT))
