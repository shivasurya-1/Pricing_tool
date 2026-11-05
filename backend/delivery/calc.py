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


def find_cycle(rows: list[dict]) -> list[str]:
    """Codes stuck in a loop of "Depends on" links (empty when there is none). Only rows that
    are switched on (`included`) count, and links to unknown, switched-off or the row's own
    code are ignored — the same rules the page's critical-path calculation uses."""
    active = {r["code"]: [d for d in r["depends_on"] if d != r["code"]] for r in rows if r["included"]}
    preds = {c: [d for d in deps if d in active] for c, deps in active.items()}
    done: set[str] = set()
    progressed = True
    while progressed and len(done) < len(preds):
        progressed = False
        for code, deps in preds.items():
            if code not in done and all(d in done for d in deps):
                done.add(code)
                progressed = True
    return [c for c in preds if c not in done]
