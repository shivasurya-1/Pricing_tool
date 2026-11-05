/**
 * Critical-path maths for the Delivery Schedule page. Pure functions, no React, no network.
 *   ES = max EF of predecessors · EF = ES + days · LF = min LS of successors · LS = LF - days
 *   Float = LS - ES · an activity with zero float (and days > 0) is critical.
 * Mirrors nothing on the server: the backend only stores each row's inputs.
 */

export interface CpmInput {
  code: string
  included: boolean
  days: number
  deps: string[]
}

export interface CpmTimes {
  es: number
  ef: number
  ls: number
  lf: number
  float: number
  critical: boolean
}

export type CpmResult = { ok: true; total: number; times: Record<string, CpmTimes>; order: string[] } | { ok: false; cycle: string[] }

const round = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * Predecessors that count. Unknown codes and the row itself are ignored. A link to an excluded
 * row passes straight through it to that row's own predecessors (A -> X -> B with X excluded
 * still makes B wait for A).
 */
export function activeDeps(row: CpmInput, byCode: Map<string, CpmInput>): string[] {
  const out = new Set<string>()
  const seen = new Set<string>([row.code])
  const stack = [...row.deps]
  while (stack.length) {
    const d = stack.pop()!
    const dep = byCode.get(d)
    if (!dep || seen.has(d)) continue
    seen.add(d)
    if (dep.included) out.add(d)
    else stack.push(...dep.deps)
  }
  return [...out]
}

/** True when a "Depends on" entry is ignored: an unknown code, or the row itself. */
export function hasIgnoredDep(row: CpmInput, byCode: Map<string, CpmInput>): boolean {
  return row.deps.some((d) => d === row.code || !byCode.has(d))
}

export function computeCpm(rows: CpmInput[]): CpmResult {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const active = rows.filter((r) => r.included)
  const preds = new Map(active.map((r) => [r.code, activeDeps(r, byCode)]))

  // Topological order; whatever is left over sits in (or behind) a loop.
  const done = new Set<string>()
  const order: string[] = []
  let progressed = true
  while (order.length < active.length && progressed) {
    progressed = false
    for (const r of active) {
      if (done.has(r.code) || !preds.get(r.code)!.every((p) => done.has(p))) continue
      done.add(r.code)
      order.push(r.code)
      progressed = true
    }
  }
  if (order.length < active.length) return { ok: false, cycle: active.map((r) => r.code).filter((c) => !done.has(c)) }

  const days = (c: string) => Math.max(0, byCode.get(c)!.days)
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const c of order) {
    es.set(c, preds.get(c)!.reduce((m, p) => Math.max(m, ef.get(p)!), 0))
    ef.set(c, round(es.get(c)! + days(c)))
  }
  const total = order.reduce((m, c) => Math.max(m, ef.get(c)!), 0)

  const succ = new Map<string, string[]>()
  for (const c of order) for (const p of preds.get(c)!) succ.set(p, [...(succ.get(p) ?? []), c])
  const ls = new Map<string, number>()
  const lf = new Map<string, number>()
  for (const c of [...order].reverse()) {
    lf.set(c, (succ.get(c) ?? []).reduce((m, s) => Math.min(m, ls.get(s)!), total))
    ls.set(c, round(lf.get(c)! - days(c)))
  }

  const times: Record<string, CpmTimes> = {}
  for (const c of order) {
    const fl = round(ls.get(c)! - es.get(c)!)
    times[c] = { es: es.get(c)!, ef: ef.get(c)!, ls: ls.get(c)!, lf: lf.get(c)!, float: fl, critical: fl === 0 && days(c) > 0 }
  }
  return { ok: true, total, times, order }
}

/** Split "a1, b2;c3" into upper-case IDs. */
export const parseDeps = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
