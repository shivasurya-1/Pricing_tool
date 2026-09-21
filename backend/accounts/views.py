from django.contrib.auth import authenticate
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import User
from .permissions import IsAdminRole
from .serializers import UserAdminSerializer, UserCreateSerializer, UserSerializer


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
    viewsets.GenericViewSet,
):
    """Admin-only user administration for the Users & Roles page.

    No delete — deactivate (`is_active=False`) instead, matching the "no destructive
    delete" precedent already used for core TechDataFieldDefinition rows: an account
    tied to real audit history shouldn't just disappear.
    """

    queryset = User.objects.all().order_by("username")
    permission_classes = [IsAdminRole]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserAdminSerializer
