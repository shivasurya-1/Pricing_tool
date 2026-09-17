from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class CanEditReferenceData(BasePermission):
    """Read: any authenticated user. Write: Controlling or Admin only.

    Shared by the formulas app and every reference/master-data endpoint —
    editing a rate, a catalog entry, or a formula all carry the same risk
    (every live price depends on it), so they share one gate.
    """

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return Role.can_edit_reference_data(request.user.role)


def role_write_permission(allowed_roles: tuple[str, ...]):
    """Factory: read open to any authenticated user, write restricted to the given
    roles (Admin always allowed). Mirrors the frontend's navConfig.ts role lists for
    Customers/Vendors/Products, which had no server-side equivalent until now."""

    class _RoleWritePermission(BasePermission):
        def has_permission(self, request, view) -> bool:
            if not (request.user and request.user.is_authenticated):
                return False
            if request.method in SAFE_METHODS:
                return True
            return request.user.role == Role.ADMIN or request.user.role in allowed_roles

    return _RoleWritePermission
