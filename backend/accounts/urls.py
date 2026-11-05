from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import UserViewSet, login_view, logout_view, me_view, role_detail_view, roles_view

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("me/", me_view, name="me"),
    path("roles/", roles_view, name="roles"),
    path("roles/<str:role>/", role_detail_view, name="role-detail"),
    path("", include(router.urls)),
]
