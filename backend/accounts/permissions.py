from rest_framework.permissions import BasePermission

from .role_permissions import has_any_permission

# HTTP method -> permission-grid action.
METHOD_ACTIONS = {
    "GET": "view",
    "HEAD": "view",
    "OPTIONS": "view",
    "POST": "create",
    "PUT": "edit",
    "PATCH": "edit",
    "DELETE": "delete",
}


class IsAdminRole(BasePermission):
    """Admin-only for both read and write — unlike reference data, user accounts
    (names, emails, roles) aren't something every role should be able to browse."""

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


def module_permission(*modules: str, read_modules=None, actions: dict | None = None):
    """Factory: gates a view on the Users & Roles grid (Admin always allowed).

    The request's action comes from its HTTP method (METHOD_ACTIONS), unless `actions`
    overrides it — keyed by the viewset action name (e.g. {"reset": "edit"}) or by
    HTTP method. Holding that action on any one of `modules` is enough.

    `read_modules` decides who may "view": a tuple of modules to check instead of
    `modules`, or None to leave reads open to any authenticated user — for lookups
    other stages' screens depend on (RFQ forms read formulas, catalogs, customers...).
    """
    overrides = actions or {}

    class _ModulePermission(BasePermission):
        def has_permission(self, request, view) -> bool:
            if not (request.user and request.user.is_authenticated):
                return False
            action = overrides.get(getattr(view, "action", None)) or overrides.get(request.method) or METHOD_ACTIONS.get(request.method)
            if action is None:
                return False
            if action == "view":
                return read_modules is None or has_any_permission(request.user, read_modules, "view")
            return has_any_permission(request.user, modules, action)

    _ModulePermission.__name__ = f"ModulePermission({', '.join(modules)})"
    return _ModulePermission


# Formulas, rates, catalogs and other master data. Writes need the action on Masters
# or on Costing: under the default grids only Controlling (Costing) and Admin hold it —
# the same pair the old CanEditReferenceData gate allowed. Reads stay open.
MASTER_DATA_WRITE_MODULES = ("Masters", "Costing")
MasterDataPermission = module_permission(*MASTER_DATA_WRITE_MODULES)
