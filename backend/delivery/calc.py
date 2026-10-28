"""The Delivery Schedule sheet's formulas. Mirrored client-side in
src/data/deliverySchedule.ts (computeActivityDays) — keep the two in step."""


def activity_days(sourcing: str, std_days: float, override_days: float | None) -> float:
    """The "Unit" column: =IF(C="Outsource",IF(E<>"",E,D),IF(C="In-house",D,IF(C="Logistics",D,0)))
    — Override Days only counts when the row is Outsourced."""
    if sourcing == "Outsource":
        return override_days if override_days is not None else std_days
    if sourcing in ("In-house", "Logistics"):
        return std_days
    return 0


def schedule_totals(rows: list[dict], safety_factor: float) -> dict:
    """TOTAL CALENDAR DAYS = longest "max" row (parallel purchased components) + every
    "sum" row; Delivery Weeks = total / 7 x safety factor."""
    max_group = max((r["days"] for r in rows if r["total_group"] == "max"), default=0)
    sum_group = sum(r["days"] for r in rows if r["total_group"] == "sum")
    total = max_group + sum_group
    return {
        "max_group_days": max_group,
        "sum_group_days": sum_group,
        "total_days": total,
        "delivery_weeks": total / 7 * safety_factor,
    }
