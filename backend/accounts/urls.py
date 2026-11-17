from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .tokens import LogoutView, RefreshView
from .views import ChangePasswordView, ForgotPasswordView, ResetPasswordCheckView, ResetPasswordView, UserViewSet, login_view, me_view, role_detail_view, roles_view

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("login/", login_view, name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("refresh/", RefreshView.as_view(), name="token-refresh"),
    path("me/", me_view, name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("reset-password/check/", ResetPasswordCheckView.as_view(), name="reset-password-check"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("roles/", roles_view, name="roles"),
    path("roles/<str:role>/", role_detail_view, name="role-detail"),
    path("", include(router.urls)),
]
