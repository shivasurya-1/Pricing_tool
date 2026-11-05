from django.contrib.auth import authenticate
from django.http import Http404
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .email import send_new_user_email
from .models import Role, RolePermission, User
from .permissions import IsAdminRole
from .role_permissions import PERMISSION_ACTIONS, PERMISSION_MODULES, all_role_permissions
from .serializers import RolePermissionUpdateSerializer, UserAdminSerializer, UserCreateSerializer, UserSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


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
        """Creates the user, then emails them their username, password and role.
        `email_sent` is false if the mail server failed — the user still exists."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data["password"]
        user = serializer.save()
        email_sent = send_new_user_email(user, password)
        return Response({**serializer.data, "email_sent": email_sent}, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError({"detail": "You can't delete your own account."})
        instance.delete()


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
    RolePermission.objects.update_or_create(role=role, defaults={"permissions": permissions})
    return Response({"role": role, "permissions": permissions})
