from rest_framework import serializers

from .models import Role, User
from .role_permissions import ADMIN_ONLY_MESSAGE, normalise_permissions, user_permissions


class UserSerializer(serializers.ModelSerializer):
    """The signed-in user (login, /me/) — `permissions` is their own role's grid, so
    the frontend can gate menus and buttons on it."""

    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "permissions"]

    def get_permissions(self, user) -> dict:
        return user_permissions(user)


class UserAdminSerializer(serializers.ModelSerializer):
    """List/retrieve/update view for the Users & Roles page — never exposes a
    password hash or any write path for one; see UserCreateSerializer for that."""

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "is_active", "last_login", "date_joined"]
        read_only_fields = ["id", "username", "last_login", "date_joined"]


class UserCreateSerializer(serializers.ModelSerializer):
    """New user. The password is a random temporary one set by UserViewSet.create and emailed
    to the user, who must replace it on the "Reset your password" page before signing in."""

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role"]
        # Required: the login details are emailed to this address.
        extra_kwargs = {"email": {"required": True, "allow_blank": False}}

    def create(self, validated_data):
        user = User(**validated_data)
        user.set_unusable_password()  # replaced at once by the temporary password
        user.save()
        return user


class RolePermissionUpdateSerializer(serializers.Serializer):
    """PATCH/PUT /api/auth/roles/<role>/ body. `role` comes from the URL (context)."""

    permissions = serializers.JSONField()

    def validate(self, attrs):
        if self.context["role"] == Role.ADMIN:
            raise serializers.ValidationError({"detail": ADMIN_ONLY_MESSAGE})
        try:
            attrs["permissions"] = normalise_permissions(attrs["permissions"])
        except ValueError as exc:
            raise serializers.ValidationError({"permissions": str(exc)})
        return attrs
