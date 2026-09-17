"""
Ports src/lib/workflow.ts exactly — the single source of truth for how an RFQ moves
through the pipeline. Previously the frontend was the only thing enforcing this; now
that RFQs are shared backend data, every transition is re-validated here so one
client can't skip a stage no matter what the UI sends.
"""

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


def require_role_can_act(role: str, stage: str) -> None:
    if role == "Admin":
        return
    if STAGE_OWNER.get(stage) != role:
        raise WorkflowError(f"Role '{role}' cannot act on stage '{stage}' (owned by '{STAGE_OWNER.get(stage)}').")


def require_valid_send_back(from_stage: str, target_stage: str) -> None:
    targets = SEND_BACK_TARGETS.get(from_stage, [])
    if target_stage not in targets:
        raise WorkflowError(f"Cannot send back from '{from_stage}' to '{target_stage}' — valid targets are {targets}.")


def require_rejectable(stage: str) -> None:
    if stage not in REJECTABLE_STAGES:
        raise WorkflowError(f"RFQ in stage '{stage}' cannot be rejected.")
