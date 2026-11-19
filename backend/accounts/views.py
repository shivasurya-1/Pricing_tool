import logging
import threading

from django.conf import settings
from django.db import connections
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .audit import describe_grid_change, describe_user_change, record_admin_event, user_snapshot
from .email import send_new_user_email, send_password_reset_email
from .models import Role, RolePermission, User
from .permissions import IsAdminRole
from .role_permissions import PERMISSION_ACTIONS, PERMISSION_MODULES, all_role_permissions, role_permissions
from .tokens import set_password_link_generator, sign_out_everywhere, signed_in_response
from .serializers import RolePermissionUpdateSerializer, UserAdminSerializer, UserCreateSerializer, UserSerializer

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """POST /api/auth/login/ — {username, password, role?}. `role` is the role card picked on
    the login page: the account must hold exactly that role (Admin included), checked only
    after the password, so a wrong guess never reveals anyone's role."""
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    role = request.data.get("role")
    if role is not None and role not in Role.values:
        return Response({"detail": f"Unknown role: {role}"}, status=status.HTTP_400_BAD_REQUEST)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
    if role is not None and user.role != role:
        return Response({"detail": f"This account is not a {role} account."}, status=status.HTTP_403_FORBIDDEN)
    update_last_login(None, user)
    # A pair of its own for this sign-in (accounts/tokens.py): access 15 min in the body,
    # refresh 7 days in the httpOnly cookie.
    return signed_in_response(user, {"user": UserSerializer(user).data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(request.user).data)


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Admin-only user administration for the Users & Roles page.

    DELETE removes the account for good (deactivating, `is_active=False`, is the
    reversible option). Records the user touched survive: every FK to User is
    SET_NULL and the audit log stores names as text. An Admin can't delete their own
    account — so the caller, an active Admin, always remains and user management is
    never locked out.
    """

    queryset = User.objects.all().order_by("username")
    permission_classes = [IsAdminRole]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserAdminSerializer

    def create(self, request, *args, **kwargs):
        """Creates the user with no password, then emails them their username, role and a
        one-time "set your password" link (NEW_USER_LINK_TIMEOUT, 72 hours by default). Nobody
        but the user ever knows the password. `email_sent` is false if the mail server failed —
        the user still exists, and `set_password_url` is returned so the Admin can pass the
        link on another way (it is never returned when the email went out)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        url = set_password_url(user)
        valid_hours = max(settings.NEW_USER_LINK_TIMEOUT // 3600, 1)
        email_sent = bool(url) and send_new_user_email(user, url, valid_hours)
        if not url:
            logger.error("FRONTEND_URL is not set, so the new user %s has no set-password link.", user.pk)
        record_admin_event(request.user, record=user.username, action=f"Added user {user.username} ({user.role})")
        body = {**UserAdminSerializer(user).data, "email_sent": email_sent, "link_valid_hours": valid_hours}
        if not email_sent and url:
            body["set_password_url"] = url
        return Response(body, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        before = user_snapshot(serializer.instance)
        user = serializer.save()
        change = describe_user_change(before, user_snapshot(user))
        if change:
            verb = "Deactivated" if before["is_active"] and not user.is_active else "Reactivated" if user.is_active and not before["is_active"] else "Edited"
            record_admin_event(self.request.user, record=user.username, action=f"{verb} user {user.username}", comment=change)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError({"detail": "You can't delete your own account."})
        username, role = instance.username, instance.role
        instance.delete()
        record_admin_event(self.request.user, record=username, action=f"Deleted user {username} ({role})")


@api_view(["GET"])
@permission_classes([IsAdminRole])
def roles_view(request):
    """GET /api/auth/roles/ — every role's grid (saved, merged over the defaults)."""
    return Response({"modules": list(PERMISSION_MODULES), "actions": list(PERMISSION_ACTIONS), "roles": all_role_permissions()})


@api_view(["PATCH", "PUT"])
@permission_classes([IsAdminRole])
def role_detail_view(request, role):
    """PATCH/PUT /api/auth/roles/<role>/ — body {permissions: {module: [actions]}}
    replaces that role's whole grid. Admin can't be edited (always full access)."""
    if role not in Role.values:
        raise Http404(f"Unknown role: {role}")
    serializer = RolePermissionUpdateSerializer(data=request.data, context={"role": role})
    serializer.is_valid(raise_exception=True)
    permissions = serializer.validated_data["permissions"]
    before = role_permissions(role)
    RolePermission.objects.update_or_create(role=role, defaults={"permissions": permissions})
    change = describe_grid_change(before, permissions)
    if change != "no change":
        record_admin_event(request.user, record=f"Role: {role}", action=f"Changed permissions of {role}", comment=change)
    return Response({"role": role, "permissions": permissions})


# ---------------------------------------------------------------------------
# Forgot / reset password
#
# Standard Django flow: the emailed link carries a uid and a token from
# default_token_generator. The token is tied to the user's current password hash and last
# login, so it works once and dies as soon as the password changes; PASSWORD_RESET_TIMEOUT
# (settings.py) sets how long it lives.
# ---------------------------------------------------------------------------

RESET_LINK_INVALID = "This reset link is invalid or has expired. Request a new one."


class _PasswordResetView(APIView):
    """Open to anyone, with no auth classes: a stale token in the browser must never turn a
    reset request into a 401. Rate limited per client IP under the `password_reset` scope
    (see NUM_PROXIES in settings for how the IP is found behind a proxy)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"


def _user_from_reset_link(uid, token):
    """The user a link belongs to, or None if the link is bad, expired or already used. Takes
    both kinds of link: a forgot-password reset link and a new user's "set your password" link
    (accounts/tokens.py). Either one dies as soon as the password is set."""
    try:
        user = User.objects.get(pk=urlsafe_base64_decode(str(uid)).decode(), is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return None
    token = str(token)
    if default_token_generator.check_token(user, token) or set_password_link_generator.check_token(user, token):
        return user
    return None


def set_password_url(user) -> str:
    """The one-time "set your password" link for a new user ('' if FRONTEND_URL isn't set)."""
    if not settings.FRONTEND_URL:
        return ""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return f"{settings.FRONTEND_URL}/set-password?uid={uid}&token={set_password_link_generator.make_token(user)}"


def _send_reset_email(user, url, valid_minutes):
    """Sends the reset email without making the request wait for the mail server, so the reply
    takes the same time whether or not the address has an account. The thread closes its own
    database connection (the email reads the company details from the database)."""
    if not settings.PASSWORD_RESET_EMAIL_IN_BACKGROUND:
        send_password_reset_email(user, url, valid_minutes)
        return

    def run():
        try:
            send_password_reset_email(user, url, valid_minutes)
        except Exception:  # never let a failure here go unlogged in a thread nobody waits on
            logger.exception("Password-reset email thread failed for user %s", user.pk)
        finally:
            connections.close_all()

    threading.Thread(target=run, name="password-reset-email", daemon=True).start()


class ForgotPasswordView(_PasswordResetView):
    """POST /api/auth/forgot-password/ — {email}. Answers the same 200 (and in about the same
    time) for any well-formed address, so it can't be used to find out which emails have
    accounts. `valid_minutes` is how long a link works, for the "check your email" screen."""

    def post(self, request):
        email = str(request.data.get("email", "")).strip()
        if "@" not in email:
            return Response({"detail": "Enter the email address of your account."}, status=status.HTTP_400_BAD_REQUEST)
        valid_minutes = max(settings.PASSWORD_RESET_TIMEOUT // 60, 1)
        if not settings.FRONTEND_URL:
            logger.error("FRONTEND_URL is not set, so password-reset emails have no link to send.")
        else:
            # Includes new users who haven't set a password yet, so a lost or expired welcome
            # link can be replaced from the login page.
            for user in User.objects.filter(email__iexact=email, is_active=True):
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
                _send_reset_email(user, url, valid_minutes)
        return Response({"detail": "If an account uses that email, a reset link is on its way.", "valid_minutes": valid_minutes})


class ResetPasswordCheckView(_PasswordResetView):
    """POST /api/auth/reset-password/check/ — {uid, token}. Lets the page say "this link has
    expired" before the user types a new password."""

    def post(self, request):
        if _user_from_reset_link(request.data.get("uid", ""), request.data.get("token", "")) is None:
            return Response({"detail": RESET_LINK_INVALID}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True})


class ResetPasswordView(_PasswordResetView):
    """POST /api/auth/reset-password/ — {uid, token, password}. Sets the new password if the
    link is good and the password passes the same checks as everywhere else, then signs the
    account out of every device (their refresh tokens are retired, so each device is out once
    its current 15-minute access token runs out). The user signs in again with the new password."""

    def post(self, request):
        user = _user_from_reset_link(request.data.get("uid", ""), request.data.get("token", ""))
        if user is None:
            return Response({"detail": RESET_LINK_INVALID}, status=status.HTTP_400_BAD_REQUEST)
        password = request.data.get("password", "")
        if not isinstance(password, str) or not password:
            return Response({"detail": "Enter a new password."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            messages = list(exc.messages)
            return Response({"detail": " ".join(messages), "errors": messages}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=["password"])
        sign_out_everywhere(user)
        return Response({"detail": "Your password has been changed. Sign in with the new password."})


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — {current_password, new_password}, for a signed-in user.

    The current password must be right (so a walk-up on an unlocked screen can't take over the
    account), and the new one goes through the same checks as everywhere else. Every refresh
    token the user has is retired (other devices are signed out once their current access token
    runs out) and a new pair comes back so this browser stays signed in.
    A wrong current password is a 400, never a 401 — the frontend signs people out on any 401."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_change"

    def post(self, request):
        user = request.user
        current = request.data.get("current_password", "")
        new = request.data.get("new_password", "")
        if not isinstance(current, str) or not isinstance(new, str) or not current or not new:
            return Response({"detail": "Enter your current password and a new one."}, status=status.HTTP_400_BAD_REQUEST)
        if not user.check_password(current):
            return Response({"detail": "Your current password is not correct."}, status=status.HTTP_400_BAD_REQUEST)
        if new == current:
            return Response({"detail": "Choose a password different from your current one."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new, user)
        except DjangoValidationError as exc:
            messages = list(exc.messages)
            return Response({"detail": " ".join(messages), "errors": messages}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new)
        user.save(update_fields=["password"])
        sign_out_everywhere(user)
        # New access token in the body, new refresh token in the cookie: this browser stays in.
        return signed_in_response(user, {"detail": "Your password has been changed."})
