"""
The Users & Roles permission matrix: one {module: [actions]} grid per role, saved in
RolePermission and read from the DB on every check (no caching), so an edit to a
role's grid applies from the very next request.

A role that was never edited uses default_role_permissions(), which reproduces the
role checks this matrix replaced — a default install behaves exactly as before.
Admin (and any superuser, via User.is_admin) always has every action.
"""

from .models import Role, RolePermission

PERMISSION_MODULES = ("Create RFQ", "Operations Review", "Sourcing", "Costing", "Approval", "Masters")
PERMISSION_ACTIONS = ("view", "create", "edit", "delete")

# The module each role owns outright (all four actions).
OWN_MODULE = {
    Role.SALES: "Create RFQ",
    Role.OPERATIONS: "Operations Review",
    Role.SOURCING: "Sourcing",
    Role.CONTROLLING: "Costing",
    Role.APPROVAL_PANEL: "Approval",
}

# View-only modules on top of the own module; every non-Admin role can view Masters.
EXTRA_VIEW_MODULES = {Role.APPROVAL_PANEL: ("Costing",)}

ADMIN_ONLY_MESSAGE = "Admin always has full access"


def full_access() -> dict:
    return {module: list(PERMISSION_ACTIONS) for module in PERMISSION_MODULES}


def no_access() -> dict:
    return {module: [] for module in PERMISSION_MODULES}


def default_role_permissions(role: str) -> dict:
    if role == Role.ADMIN:
        return full_access()
    grid = no_access()
    own = OWN_MODULE.get(role)
    if own:
        grid[own] = list(PERMISSION_ACTIONS)
    for module in ("Masters", *EXTRA_VIEW_MODULES.get(role, ())):
        if not grid[module]:
            grid[module] = ["view"]
    return grid


def normalise_permissions(raw) -> dict:
    """Validates a submitted grid and returns it with every module present and each
    module's actions de-duplicated in canonical order. A module left out means no
    actions. Raises ValueError with a user-facing message."""
    if not isinstance(raw, dict):
        raise ValueError("Must be an object of {module: [actions]}.")
    unknown_modules = [m for m in raw if m not in PERMISSION_MODULES]
    if unknown_modules:
        raise ValueError(f"Unknown module(s): {', '.join(map(str, unknown_modules))}. Allowed: {', '.join(PERMISSION_MODULES)}.")
    grid = no_access()
    for module, actions in raw.items():
        if not isinstance(actions, list):
            raise ValueError(f"'{module}': actions must be a list.")
        unknown_actions = [a for a in actions if a not in PERMISSION_ACTIONS]
        if unknown_actions:
            raise ValueError(f"'{module}': unknown action(s) {', '.join(map(str, unknown_actions))}. Allowed: {', '.join(PERMISSION_ACTIONS)}.")
        grid[module] = [a for a in PERMISSION_ACTIONS if a in actions]
    return grid


def _merge_over_defaults(role: str, saved: dict | None) -> dict:
    grid = default_role_permissions(role)
    if saved is None:
        return grid
    for module in PERMISSION_MODULES:
        if isinstance(saved.get(module), list):
            grid[module] = [a for a in PERMISSION_ACTIONS if a in saved[module]]
    return grid


def role_permissions(role: str) -> dict:
    if role == Role.ADMIN:
        return full_access()
    saved = RolePermission.objects.filter(role=role).values_list("permissions", flat=True).first()
    return _merge_over_defaults(role, saved)


def all_role_permissions() -> dict:
    saved = dict(RolePermission.objects.values_list("role", "permissions"))
    return {role: full_access() if role == Role.ADMIN else _merge_over_defaults(role, saved.get(role)) for role in Role.values}


def user_permissions(user) -> dict:
    """The grid the frontend gates menus and buttons on (GET /api/auth/me/, login)."""
    if not (user and user.is_authenticated and user.is_active):
        return no_access()
    if user.is_admin:
        return full_access()
    return role_permissions(user.role)


def has_permission(user, module: str, action: str) -> bool:
    return has_any_permission(user, (module,), action)


def has_any_permission(user, modules, action: str) -> bool:
    """True if the user holds `action` on at least one of `modules`."""
    if not (user and user.is_authenticated and user.is_active):
        return False
    if user.is_admin:
        return True
    grid = role_permissions(user.role)
    return any(action in grid.get(module, []) for module in modules)
