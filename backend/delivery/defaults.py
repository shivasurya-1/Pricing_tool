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


PU = ["PU1", "PU2", "PU3", "PU4", "PU5"]

# Each workbook row's critical-path inputs, in DEFAULT_ACTIVITIES order: (code, included,
# depends_on). The codes are the page's (src/data/deliverySchedule.ts ACTIVITY_CODES — keep
# the two in step): A = planning, B = shell, R = ready tube, H = hub, C = post-weld,
# PU = purchased, L = lagging, F = final assembly. The links reproduce the workbook's
# =MAX(F28:F32)+F6+F7+...: BOM → purchasing → the five purchased parts in parallel →
# post-weld → lagging → final assembly = 139 days. Phase 1 keeps its own shell/hub chains
# but starts excluded, as in the workbook; the outsourced Ready Tube (R1/R2) is the
# alternative to B1–B6.
DEFAULT_LINKS = [
    ("A1", True, []),
    ("A2", True, ["A1"]),
    ("B1", False, ["A2"]),
    ("B2", False, ["B1"]),
    ("B3", False, ["B2"]),
    ("B4", False, ["B3"]),
    ("B5", False, ["B4"]),
    ("B6", False, ["B5"]),
    ("R1", False, ["A2"]),
    ("R2", False, ["R1"]),
    ("H1", False, ["A2"]),
    ("H2", False, ["H1"]),
    ("H3", False, ["H2"]),
    ("H4", False, ["B6", "H3"]),
    ("H5", False, ["H4"]),
    ("C1", True, PU),
    ("C2", True, ["C1"]),
    ("C3", True, ["C2"]),
    ("C4", True, ["C3"]),
    ("PU1", True, ["A2"]),
    ("PU2", True, ["A2"]),
    ("PU3", True, ["A2"]),
    ("PU4", True, ["A2"]),
    ("PU5", True, ["A2"]),
    ("L1", True, ["C4"]),
    ("L2", True, ["L1"]),
    ("F1", True, ["L2"]),
    ("F2", True, ["F1"]),
    ("F3", True, ["F2"]),
]
assert len(DEFAULT_LINKS) == len(DEFAULT_ACTIVITIES)

# Stable IDs for the "Depends on" column, in DEFAULT_ACTIVITIES order.
DEFAULT_CODES = [code for code, *_ in DEFAULT_LINKS]

# Workbook label → (code, included, depends_on) — how migration 0004 links existing rows.
DEFAULT_LINKS_BY_LABEL = {label: links for (_, label, *_), links in zip(DEFAULT_ACTIVITIES, DEFAULT_LINKS)}


def default_activity_rows() -> list[dict]:
    return [
        {
            "phase": phase, "label": label, "sourcing": sourcing, "std_days": std, "override_days": override,
            "unit": unit, "notes": notes, "total_group": group, "order": i,
        }
        for i, (phase, label, sourcing, std, override, unit, notes, group) in enumerate(DEFAULT_ACTIVITIES)
    ]


def default_activity_rows_with_links() -> list[dict]:
    """default_activity_rows() plus code / included / depends_on — what "Reset" restores.
    (Kept separate: migration 0002 seeds from default_activity_rows() before those fields
    exist.)"""
    return [
        {**row, "code": code, "included": included, "depends_on": list(deps)}
        for row, (code, included, deps) in zip(default_activity_rows(), DEFAULT_LINKS)
    ]
