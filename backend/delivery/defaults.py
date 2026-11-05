"""The client workbook's "Delivery Schedule" tab as shipped (Sample _Drum_Drive_Pulley_
Pricing Tool.xlsx) — seeded by migration 0002 and restored by "Reset to workbook
defaults". Total = longest of the "max" rows + every "sum" row = 84 + 55 = 139 days."""

DEFAULT_SAFETY_FACTOR = 1.2

P0 = "PHASE 0: PLANNING & PROCUREMENT"
P1 = "PHASE 1: PULLEY BODY"
P2 = "PHASE 2: POST-WELD PROCESSING"
P3 = "PHASE 3: PURCHASED COMPONENTS"
P4 = "PHASE 4: LAGGING"
P5 = "PHASE 5: FINAL ASSEMBLY & DISPATCH"

# (phase, label, sourcing, std_days, override_days, unit, notes, total_group)
DEFAULT_ACTIVITIES = [
    (P0, "BOM Release & Engineering Sign-off", "In-house", 2, None, "h", "Hours converted: ~2h = 0.25 day", "sum"),
    (P0, "Purchasing – Critical Parts", "In-house", 5, None, "days", "Internal purchasing dept", "sum"),
    (P1, "Shell Plate Procurement", "Outsource", 35, 35, "days", "Plate mill lead time", "none"),
    (P1, "Logistic – Plates to Works", "Logistics", 1, 1, "days", "", "none"),
    (P1, "Weld Preparation", "In-house", 1, 2, "days", "Calc from geometry", "none"),
    (P1, "Rolling / Bending + Calibration", "In-house", 1, 2, "days", "In-house rolling", "none"),
    (P1, "Tacking & Grinding Shell", "In-house", 1, 1, "days", "", "none"),
    (P1, "Heat-up & Longitudinal Weld", "In-house", 1, 1, "days", "", "none"),
    (P1, "Ready Tube (outsourced shell option)", "Outsource", 40, 14, "days", "If tube outsourced: 14d", "none"),
    (P1, "Logistic – Ready Tube", "Logistics", 0, 1, "days", "Only if outsourced", "none"),
    (P1, "Hub Material Procurement", "Outsource", 35, 35, "days", "Cast / forged hub", "none"),
    (P1, "Logistic – Hub Material", "Logistics", 1, 1, "days", "", "none"),
    (P1, "Hub Pre-Turning", "In-house", 2, 5, "days", "Depends on size", "none"),
    (P1, "Hub-to-Shell Tacking & Grinding", "In-house", 1, 2, "days", "", "none"),
    (P1, "Hub-to-Shell Weld", "In-house", 1, 2, "days", "", "none"),
    (P2, "Stress Relief Annealing", "Outsource", 7, 7, "days", "Outsourced heat treater", "sum"),
    (P2, "Logistic – Stress Relief (both ways)", "Logistics", 6, 6, "days", "To/from heat treater", "sum"),
    (P2, "Machining – Body (turning, boring, facing)", "Outsource", 7, 10, "days", "Can be in-house or outsourced", "sum"),
    (P2, "Test & Dynamic Balancing", "In-house", 3, 3, "days", "", "sum"),
    (P3, "Shaft (Procurement / Machining)", "Outsource", 84, 84, "days", "Forged shaft lead time", "max"),
    (P3, "Bearing (Procurement)", "Outsource", 60, 60, "days", "SKF/FAG India: 60-120d", "max"),
    (P3, "Bearing Housing (Procurement)", "Outsource", 84, 84, "days", "MASTA/SKF housing", "max"),
    (P3, "Adapter Sleeve (Procurement)", "Outsource", 30, 60, "days", "", "max"),
    (P3, "Locking Device (Procurement)", "Outsource", 60, 60, "days", "NMTG / BIKON", "max"),
    (P4, "Lagging Application", "Outsource", 14, 14, "days", "Rubber hot vulcanised", "sum"),
    (P4, "Logistic – Lagging (both ways)", "Logistics", 2, 2, "days", "", "sum"),
    (P5, "Final Assembly & Inspection", "In-house", 3, 4, "days", "", "sum"),
    (P5, "Painting & Packing", "In-house", 3, 4, "days", "", "sum"),
    (P5, "Weekend Buffer", "—", 5, 5, "days", "~10% for weekends", "sum"),
]


# How a row added on the page counts in the total — the same as the workbook's own rows
# in that phase (Phase 3 is the MAX() group, Phase 1 isn't in the formula, the rest add).
PHASE_TOTAL_GROUP = {phase: group for phase, *_, group in DEFAULT_ACTIVITIES}


# Stable IDs for the "Depends on" column, in DEFAULT_ACTIVITIES order.
DEFAULT_CODES = [
    "A1", "A2",
    "B1", "B2", "B3", "B4", "B5", "B6", "R1", "R2", "H1", "H2", "H3", "H4", "H5",
    "C1", "C2", "C3", "C4",
    "PU1", "PU2", "PU3", "PU4", "PU5",
    "L1", "L2",
    "F1", "F2", "F3",
]

_PURCHASED = ["PU1", "PU2", "PU3", "PU4", "PU5"]
# The workbook's own logic: post-weld work waits for the longest purchased item, which gives the
# same 139 days as the formula above. Phase 1 (body manufacturing) is chained too but has float, so it
# does not move the total.
DEFAULT_DEPENDS_ON = {
    "A1": [], "A2": ["A1"],
    "B1": ["A2"], "B2": ["B1"], "B3": ["B2"], "B4": ["B3"], "B5": ["B4"], "B6": ["B5"], "R1": ["A2"], "R2": ["R1"],
    "H1": ["A2"], "H2": ["H1"], "H3": ["H2"], "H4": ["B6", "H3"], "H5": ["H4"],
    "PU1": ["A2"], "PU2": ["A2"], "PU3": ["A2"], "PU4": ["A2"], "PU5": ["A2"],
    "C1": _PURCHASED, "C2": ["C1"], "C3": ["C2"], "C4": ["C3"],
    "L1": ["C4"], "L2": ["L1"], "F1": ["L2"], "F2": ["F1"], "F3": ["F2"],
}


def default_activity_rows() -> list[dict]:
    return [
        {
            "phase": phase, "label": label, "sourcing": sourcing, "std_days": std, "override_days": override,
            "unit": unit, "notes": notes, "total_group": group, "order": i,
            "code": DEFAULT_CODES[i], "included": True,
            "depends_on": DEFAULT_DEPENDS_ON.get(DEFAULT_CODES[i], []),
        }
        for i, (phase, label, sourcing, std, override, unit, notes, group) in enumerate(DEFAULT_ACTIVITIES)
    ]
