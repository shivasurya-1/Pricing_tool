"""
Ports src/lib/workflow.ts exactly — the single source of truth for how an RFQ moves
through the pipeline. Previously the frontend was the only thing enforcing this; now
that RFQs are shared backend data, every transition is re-validated here so one
client can't skip a stage no matter what the UI sends.
"""

from accounts.role_permissions import has_any_permission

STAGE_OWNER = {
    "Draft": "Sales",
    "Operations Review": "Operations",
    "Sourcing": "Sourcing",
    "Controlling": "Controlling",
    "Approval Pending": "Approval Panel",
    "Approved": "Sales",
    "Quotation Generated": "Sales",
    "Quotation Sent": "Sales",
    "Won": None,
    "Lost": None,
    "Rejected": None,
}

# The Users & Roles grid module that acts on each stage. Under the default grids only
# the stage's STAGE_OWNER holds edit on it, so the grid check matches the old
# role == owner check. Won/Lost/Rejected have no module: only Admin may act.
STAGE_MODULE = {
    "Draft": "Create RFQ",
    "Operations Review": "Operations Review",
    "Sourcing": "Sourcing",
    "Controlling": "Costing",
    "Approval Pending": "Approval",
    "Approved": "Create RFQ",
    "Quotation Generated": "Create RFQ",
    "Quotation Sent": "Create RFQ",
}

NEXT_STAGE = {
    "Draft": "Operations Review",
    "Operations Review": "Sourcing",
    "Sourcing": "Controlling",
    "Controlling": "Approval Pending",
    "Approval Pending": "Approved",
    "Approved": "Quotation Generated",
    "Quotation Generated": "Quotation Sent",
}

SEND_BACK_TARGETS = {
    "Operations Review": ["Draft"],
    "Sourcing": ["Operations Review", "Draft"],
    "Controlling": ["Sourcing", "Draft"],
    "Approval Pending": ["Controlling", "Sourcing", "Draft"],
}

REJECTABLE_STAGES = ["Operations Review", "Sourcing", "Controlling", "Approval Pending"]


class WorkflowError(Exception):
    """Raised when a requested transition isn't valid from the RFQ's current stage."""


def require_stage(rfq, expected_stage: str) -> None:
    if rfq.stage != expected_stage:
        raise WorkflowError(f"RFQ is in '{rfq.stage}', not '{expected_stage}' — action not allowed.")


def require_can_act(user, stage: str, action: str = "edit") -> None:
    """The user needs `action` on the stage's module (Admin always may)."""
    module = STAGE_MODULE.get(stage)
    if not has_any_permission(user, (module,) if module else (), action):
        raise WorkflowError(
            f"Role '{user.role}' cannot act on stage '{stage}' (needs '{action}' on '{module or 'Admin only'}')."
        )


def require_valid_send_back(from_stage: str, target_stage: str) -> None:
    targets = SEND_BACK_TARGETS.get(from_stage, [])
    if target_stage not in targets:
        raise WorkflowError(f"Cannot send back from '{from_stage}' to '{target_stage}' — valid targets are {targets}.")


def require_rejectable(stage: str) -> None:
    if stage not in REJECTABLE_STAGES:
        raise WorkflowError(f"RFQ in stage '{stage}' cannot be rejected.")
