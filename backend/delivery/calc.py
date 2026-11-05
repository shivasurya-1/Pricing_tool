"""The Delivery Schedule sheet's formulas. Mirrored client-side in
src/data/deliverySchedule.ts (computeActivityDays) — keep the two in step."""

# Float days (e.g. 0.25 for a 2-hour task) — a float of 1e-12 is still "no float".
EPS = 1e-9


def activity_days(sourcing: str, std_days: float, override_days: float | None) -> float:
    """The "Unit" column: =IF(C="Outsource",IF(E<>"",E,D),IF(C="In-house",D,IF(C="Logistics",D,0)))
    — Override Days only counts when the row is Outsourced."""
    if sourcing == "Outsource":
        return override_days if override_days is not None else std_days
    if sourcing in ("In-house", "Logistics"):
        return std_days
    return 0


def find_cycle(graph: dict[str, list[str]]) -> list[str] | None:
    """A circular "Depends on" chain as [A, B, ..., A], or None. Links to codes that
    aren't in the graph are ignored."""
    WHITE, GREY, BLACK = 0, 1, 2
    colour = dict.fromkeys(graph, WHITE)
    path: list[str] = []

    def visit(code: str) -> list[str] | None:
        colour[code] = GREY
        path.append(code)
        for dep in graph[code]:
            if dep not in colour:
                continue
            if colour[dep] == GREY:
                return path[path.index(dep):] + [dep]
            if colour[dep] == WHITE and (cycle := visit(dep)):
                return cycle
        path.pop()
        colour[code] = BLACK
        return None

    for code in graph:
        if colour[code] == WHITE and (cycle := visit(code)):
            return cycle
    return None


def reroute_links(depends_on: list[str], kept: set[str], removed: dict[str, list[str]]) -> list[str]:
    """A row's links after other rows are deleted: a link to a deleted row is replaced by
    that row's own links (so B→X→A becomes B→A and the chain stays joined); links to
    codes that never existed are dropped."""
    out: list[str] = []
    seen: set[str] = set()

    def add(code: str) -> None:
        if code in seen:
            return
        seen.add(code)
        if code in kept:
            out.append(code)
        elif code in removed:
            for dep in removed[code]:
                add(dep)

    for code in depends_on:
        add(code)
    return out


def critical_path(rows: list[dict]) -> dict:
    """Critical-path (CPM) pass over the sheet's "Depends on" links. Each row needs
    `code`, `days`, `included` and `depends_on`.

    Forward: ES = max EF of predecessors (0 if none), EF = ES + days.
    Backward: LF = min LS of successors (project end if none), LS = LF - days.
    Float = LS - ES; critical = float 0 and days > 0. Ties (several chains of the same
    length) all come out critical. An excluded row passes straight through as 0 days, so
    a chain running over it stays joined; it gets no timings of its own. Links to
    unknown codes and to the row itself are ignored. Raises ValueError on a cycle.

    Returns {"total_days", "critical_codes" (sheet order), "timings": {code: {...}}}.
    """
    codes = [r["code"] for r in rows]
    days = {r["code"]: (r["days"] if r["included"] else 0) for r in rows}
    preds = {r["code"]: [p for p in dict.fromkeys(r["depends_on"]) if p in days and p != r["code"]] for r in rows}
    succs: dict[str, list[str]] = {c: [] for c in codes}
    for code, ps in preds.items():
        for p in ps:
            succs[p].append(code)

    # Kahn's topological order, sheet order among ready rows.
    remaining = {c: len(preds[c]) for c in codes}
    ready = [c for c in codes if remaining[c] == 0]
    order: list[str] = []
    while ready:
        code = ready.pop(0)
        order.append(code)
        for s in succs[code]:
            remaining[s] -= 1
            if remaining[s] == 0:
                ready.append(s)
    if len(order) != len(codes):
        raise ValueError("The Depends on links form a cycle.")

    es: dict[str, float] = {}
    ef: dict[str, float] = {}
    for code in order:
        es[code] = max((ef[p] for p in preds[code]), default=0)
        ef[code] = es[code] + days[code]
    end = max(ef.values(), default=0)

    ls: dict[str, float] = {}
    lf: dict[str, float] = {}
    for code in reversed(order):
        lf[code] = min((ls[s] for s in succs[code]), default=end)
        ls[code] = lf[code] - days[code]

    timings = {}
    critical_codes = []
    for r in rows:
        code = r["code"]
        if not r["included"]:
            timings[code] = {"es": None, "ef": None, "ls": None, "lf": None, "float": None, "critical": False}
            continue
        slack = ls[code] - es[code]
        critical = abs(slack) < EPS and days[code] > 0
        if critical:
            critical_codes.append(code)
        timings[code] = {
            "es": _clean(es[code]), "ef": _clean(ef[code]), "ls": _clean(ls[code]), "lf": _clean(lf[code]),
            "float": _clean(slack), "critical": critical,
        }
    return {"total_days": _clean(end), "critical_codes": critical_codes, "timings": timings}


def schedule_totals(rows: list[dict], safety_factor: float) -> dict:
    """TOTAL CALENDAR DAYS = the critical path through the rows' "Depends on" links;
    Delivery Weeks = total / 7 x safety factor. `max_group_days` / `sum_group_days`
    (the workbook's old =MAX(F28:F32)+F6+F7+... split) are kept for older clients
    only — they no longer make up the total."""
    cpm = critical_path(rows)
    total = cpm["total_days"]
    return {
        "max_group_days": max((r["days"] for r in rows if r["total_group"] == "max"), default=0),
        "sum_group_days": sum(r["days"] for r in rows if r["total_group"] == "sum"),
        "total_days": total,
        "delivery_weeks": total / 7 * safety_factor,
        "critical_codes": cpm["critical_codes"],
        "timings": cpm["timings"],
    }


def _clean(x: float) -> float:
    """Trim float noise (0.1 + 0.2) and turn -0.0 into 0.0."""
    return round(x, 6) + 0.0
