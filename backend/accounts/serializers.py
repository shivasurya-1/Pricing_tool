from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role"]


class UserAdminSerializer(serializers.ModelSerializer):
    """List/retrieve/update view for the Users & Roles page — never exposes a
    password hash or any write path for one; see UserCreateSerializer for that."""

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "is_active", "last_login", "date_joined"]
        read_only_fields = ["id", "username", "last_login", "date_joined"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "role", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
