"""Audit Log entries for administration changes: users added, edited, deactivated or deleted,
and a role's permission grid changed. They are AuditEvents with no RFQ (module "Users & Roles"),
listed on the Audit Log page next to the RFQ history and visible to Admins only."""

from datetime import datetime, timezone

ADMIN_AUDIT_MODULE = "Users & Roles"


def _actor_name(user) -> str:
    return (user.get_full_name() or user.username) if user else ""


def record_admin_event(actor, *, record: str, action: str, comment: str | None = None) -> None:
    """One Audit Log line: who (`actor`, the signed-in Admin) did what to which record."""
    from rfq.models import AuditEvent  # imported here: the rfq app depends on accounts, not the reverse

    AuditEvent.objects.create(
        rfq=None,
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        user=_actor_name(actor)[:120],
        role=str(getattr(actor, "role", ""))[:20],
        module=ADMIN_AUDIT_MODULE,
        record=record[:60],
        action=action[:300],
        comment=comment,
    )


def describe_grid_change(before: dict, after: dict) -> str:
    """'Costing: +edit -delete; Create RFQ: +create' — only the modules that changed."""
    parts = []
    for module in sorted(set(before) | set(after)):
        old, new = set(before.get(module, [])), set(after.get(module, []))
        if old == new:
            continue
        changes = [f"+{a}" for a in sorted(new - old)] + [f"-{a}" for a in sorted(old - new)]
        parts.append(f"{module}: {' '.join(changes)}")
    return "; ".join(parts) or "no change"


# User fields an Admin can change on the Users & Roles page, with the label used in the log.
USER_AUDIT_FIELDS = {
    "first_name": "first name",
    "last_name": "last name",
    "email": "email",
    "role": "role",
    "is_active": "active",
}


def describe_user_change(before: dict, after: dict) -> str:
    """'role: Sales -> Controlling; active: yes -> no' — only the fields that changed."""
    def show(value):
        if isinstance(value, bool):
            return "yes" if value else "no"
        return str(value) if value not in (None, "") else "(blank)"

    parts = [
        f"{label}: {show(before.get(field))} -> {show(after.get(field))}"
        for field, label in USER_AUDIT_FIELDS.items()
        if before.get(field) != after.get(field)
    ]
    return "; ".join(parts)


def user_snapshot(user) -> dict:
    return {field: getattr(user, field) for field in USER_AUDIT_FIELDS}
