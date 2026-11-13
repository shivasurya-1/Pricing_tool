import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { computeCpm, criticalChains, type CpmInput } from '@/lib/deliveryCpm'

/** What the chart needs about one schedule row. */
export interface CpRow {
  code: string
  label: string
  phase: string
  included: boolean
  deps: string[]
  days: number
}
export interface CpTimes {
  es: number
  ef: number
  float: number
}

const STEEL = '#8FA3C0'
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))
/** "Shaft (Procurement / Machining)" -> "Shaft"; "Logistic – Lagging (both ways)" -> "Logistics: Lagging". */
const short = (label: string) => label.replace(/\s*\(.*?\)/g, '').replace(/^Logistic – /, 'Logistics: ')
const phaseNo = (phase: string) => /^PHASE (\d+)/.exec(phase)?.[1] ?? '·'
const phaseName = (phase: string) => {
  const n = phase.replace(/^PHASE \d+:\s*/, '').toLowerCase()
  return n.charAt(0).toUpperCase() + n.slice(1)
}

type Chart = 'steps' | 'phase' | 'slack'
const CHARTS: { id: Chart; label: string }[] = [
  { id: 'steps', label: 'Steps in order' },
  { id: 'phase', label: 'Days by phase' },
  { id: 'slack', label: 'Spare time (slack)' },
]

/**
 * The critical path as bar charts, for people who just want to know what sets the delivery date.
 * Every number comes from `times` (the backend's, or the live preview while edits are unsaved).
 */
export function DeliveryCriticalPath({
  rows,
  times,
  total,
  weeks,
  factor,
  preview,
  loop,
  onJump,
}: {
  rows: CpRow[]
  times: Record<string, CpTimes>
  total: number
  weeks: number
  factor: number
  /** True while there are unsaved edits, so the numbers are a live preview. */
  preview: boolean
  /** Rows in a circular dependency, if any — nothing can be drawn until it is fixed. */
  loop: string[] | null
  onJump: (code: string) => void
}) {
  const [chart, setChart] = useState<Chart>('steps')
  const [route, setRoute] = useState(0)

  const inputs: CpmInput[] = useMemo(() => rows.map((r) => ({ code: r.code, included: r.included, days: r.days, deps: r.deps })), [rows])
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows])
  const { chains, count } = useMemo(() => criticalChains(inputs, times), [inputs, times])

  if (loop) {
    return (
      <Card className="p-5">
        <div role="alert" className="flex items-start gap-2 text-sm text-[var(--color-red)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            The schedule has a circular dependency ({loop.join(', ')}), so the critical path can't be drawn. Fix it on the Schedule tab.
          </span>
        </div>
      </Card>
    )
  }

  const chain = chains[Math.min(route, Math.max(chains.length - 1, 0))] ?? []
  const nameOf = (c: string) => byCode.get(c)?.label ?? c
  const d = (c: string) => byCode.get(c)?.days ?? 0
  const t = (c: string) => times[c]
  const active = rows.filter((r) => r.included && times[r.code])
  const critCount = active.filter((r) => r.days > 0 && Math.abs(times[r.code].float) < 1e-6).length
  const wk = Math.round(weeks)

  // Route names: what differs between tied chains (e.g. "Shaft" vs "Bearing Housing").
  const common = chains[0]?.filter((c) => chains.every((x) => x.includes(c))) ?? []
  const routeNames = chains.length > 1 ? chains.map((x, i) => x.filter((c) => !common.includes(c)).map((c) => short(nameOf(c))).join(' + ') || `Route ${i + 1}`) : []

  const big = [...chain].sort((a, b) => d(b) - d(a))[0]
  const bigPct = big && total ? Math.round((d(big) / total) * 100) : 0

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-base font-semibold uppercase tracking-wide text-[var(--color-navy)]">Critical path</h2>
            <p className="text-xs text-[var(--color-ink-faint)]">The steps that set your delivery date, drawn as bars. Longer bar = more days.</p>
          </div>
          {preview && <span className="rounded-full border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-2.5 py-1 text-xs font-semibold text-[var(--color-amber)]">Preview of unsaved changes</span>}
        </div>

        <div className="grid gap-2.5 px-5 pt-3 sm:grid-cols-3">
          <Stat tone="crit" label="Critical path" value={fmt(total)} unit="days" note="order to dispatch, calendar days" />
          <Stat tone="ok" label="Delivery time" value={String(wk)} unit="weeks" note={`${fmt(total)} ÷ 7 = ${(total / 7).toFixed(1)}, × ${factor} safety = ${weeks.toFixed(1)}, rounded`} />
          <Stat label="Steps that set the date" value={String(critCount)} unit={`of ${active.length} active`} note="the rest have spare time" />
        </div>

        <p aria-live="polite" className="mx-5 mt-3 rounded-lg bg-[var(--color-blue-50)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink)]">
          {chain.length === 0 ? (
            'No step has days yet.'
          ) : (
            <>
              Delivery takes <b>{fmt(total)} days</b> because <b>{chain.length} steps</b> must happen one after another. The longest wait is <b>{short(nameOf(big))}</b> ({fmt(d(big))} days, {bigPct}% of the total). Speeding up anything that is <b>not</b> on
              this path will not make delivery faster.
              {routeNames.length > 1 && (
                <>
                  {' '}
                  <b>{count} routes are exactly as long</b> ({routeNames.slice(0, 4).join(', ')}), so shortening only one of them saves nothing.
                </>
              )}
            </>
          )}
        </p>

        {routeNames.length > 1 && (
          <div className="mx-5 mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-soft)]">
            <span>Show the route through:</span>
            {routeNames.slice(0, 6).map((n, i) => (
              <button
                key={n}
                type="button"
                aria-pressed={i === Math.min(route, routeNames.length - 1)}
                onClick={() => setRoute(i)}
                className={clsx(
                  'rounded-full border px-3 py-1 font-medium',
                  i === Math.min(route, routeNames.length - 1) ? 'border-[var(--color-orange)] bg-[var(--color-orange)] text-white' : 'border-[var(--color-border)] bg-white hover:bg-[var(--color-surface)]',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--color-ink-soft)]">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-4 rounded-sm bg-[var(--color-orange)]" />
              Critical: a delay here delays delivery
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: STEEL }} />
              Not critical: has spare time
            </span>
            <span className="text-[var(--color-ink-faint)]">Click any bar to jump to its row.</span>
          </div>
          <div role="tablist" aria-label="Critical path chart" className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)]">
            {CHARTS.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={chart === c.id}
                onClick={() => setChart(c.id)}
                className={clsx('border-r border-[var(--color-border)] px-3.5 py-1.5 text-sm font-medium last:border-r-0', chart === c.id ? 'bg-[var(--color-navy-700)] text-white' : 'bg-white hover:bg-[var(--color-surface)]')}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-auto">
        {chart === 'steps' && <StepsChart chain={chain} total={total} weeks={wk} factor={factor} inputs={inputs} chains={chains} route={Math.min(route, Math.max(chains.length - 1, 0))} nameOf={nameOf} d={d} t={t} onJump={onJump} />}
        {chart === 'phase' && <PhaseChart chain={chain} total={total} rows={rows} d={d} />}
        {chart === 'slack' && <SlackChart active={active} t={t} onJump={onJump} />}
      </Card>
    </div>
  )
}

function Stat({ label, value, unit, note, tone }: { label: string; value: string; unit: string; note: string; tone?: 'crit' | 'ok' }) {
  return (
    <div
      className={clsx(
        'rounded-lg border px-3.5 py-2.5',
        tone === 'crit' && 'border-[var(--color-orange-100)] bg-[var(--color-orange-50)]',
        tone === 'ok' && 'border-[var(--color-green-100)] bg-[var(--color-green-50)]',
        !tone && 'border-[var(--color-border)] bg-[var(--color-surface)]',
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">{label}</div>
      <div className="text-3xl font-semibold leading-tight text-[var(--color-navy)]">
        {value}
        <span className="ml-1.5 text-sm font-normal text-[var(--color-ink-faint)]">{unit}</span>
      </div>
      <div className="text-xs text-[var(--color-ink-soft)]">{note}</div>
    </div>
  )
}

/* ---------- shared chart pieces ---------- */

const cols = (pill: number): CSSProperties => ({ ['--lab' as string]: '300px', ['--pill' as string]: `${pill}px`, minWidth: 720 })
const rowGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'var(--lab) 1fr var(--pill)', alignItems: 'center' }

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-4 pb-2 pt-3">
      <div className="text-sm font-semibold text-[var(--color-ink)]">{title}</div>
      <div className="text-xs text-[var(--color-ink-faint)]">{sub}</div>
    </div>
  )
}

function Bar({ left, width, tone, children }: { left: number; width: number; tone?: 'steel' | 'amber' | 'navy'; children: string }) {
  const wide = width >= 8
  const bg = tone === 'steel' ? STEEL : tone === 'amber' ? 'var(--color-amber)' : tone === 'navy' ? 'var(--color-navy)' : 'var(--color-orange)'
  return (
    <div
      className="absolute top-2 z-[2] flex h-[22px] min-w-[3px] items-center justify-end whitespace-nowrap rounded-[3px] px-2 font-mono text-xs font-semibold text-white"
      style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%`, background: bg }}
    >
      {wide ? (
        children
      ) : (
        <span className="absolute font-mono text-xs font-semibold text-[var(--color-ink)]" style={left > 82 ? { right: 'calc(100% + 6px)' } : { left: 'calc(100% + 6px)' }}>
          {children}
        </span>
      )}
    </div>
  )
}

function Pill({ tone, children, title }: { tone: 'yes' | 'warn'; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-block rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold',
        tone === 'yes' ? 'border-[var(--color-green-100)] bg-[var(--color-green-50)] text-green-800' : 'border-[var(--color-amber-100)] bg-[var(--color-amber-50)] text-amber-800',
      )}
    >
      {children}
    </span>
  )
}

function Label({ no, title, sub, muted }: { no: ReactNode; title: string; sub: string; muted?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-1.5">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold text-white" style={{ background: muted ? STEEL : 'var(--color-orange)' }}>
        {no}
      </span>
      <span className="min-w-0 leading-tight">
        <b className="block text-[13px] font-semibold">{title}</b>
        <small className="font-mono text-[11px] text-[var(--color-ink-faint)]">{sub}</small>
      </span>
    </div>
  )
}

/** Day scale across the top: week marks every 7 days, labelled every 1, 2 or 4 weeks. */
function Axis({ total, left, right, pill }: { total: number; left: string; right: string; pill: number }) {
  const step = total >= 120 ? 28 : total >= 56 ? 14 : 7
  const labels: number[] = []
  for (let day = 0; day <= total - step * 0.4; day += step) labels.push(day)
  const weekLines: number[] = []
  for (let day = 0; day <= total; day += 7) weekLines.push(day)
  return (
    <>
      <div style={{ ...rowGrid, minHeight: 34 }} className="sticky top-0 z-[3] border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">{left}</div>
        <div className="relative h-[34px]">
          {labels.map((day) => (
            <div key={day} className="absolute top-0.5 whitespace-nowrap text-center font-mono text-[11px] leading-tight text-[var(--color-ink-soft)]" style={{ left: `${(day / total) * 100}%`, transform: day === 0 ? 'none' : 'translateX(-50%)' }}>
              Day {day}
              <small className="block text-[10px] text-[var(--color-ink-faint)]">{day ? `week ${day / 7}` : 'order'}</small>
            </div>
          ))}
          <div className="absolute right-0 top-0.5 whitespace-nowrap text-right font-mono text-[11px] font-semibold leading-tight text-[var(--color-navy)]">
            Day {fmt(total)}
            <small className="block text-[10px] font-normal text-[var(--color-ink-faint)]">dispatch</small>
          </div>
        </div>
        <div className="px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">{right}</div>
      </div>
      {/* gridlines sit over the bar column only */}
      <div className="pointer-events-none absolute bottom-0 top-[34px] z-[1]" style={{ left: 'var(--lab)', right: `${pill}px` }} aria-hidden="true">
        {weekLines.map((day) => (
          <i key={day} className="absolute inset-y-0 border-l" style={{ left: `${(day / total) * 100}%`, borderColor: day % step === 0 ? '#D5DBE4' : '#EDF0F4' }} />
        ))}
        <i className="absolute inset-y-0 right-0 border-l-2 border-dashed border-[var(--color-navy)]" />
      </div>
    </>
  )
}

/* ---------- 1. Steps in order (the Gantt-style chart) ---------- */

function StepsChart({
  chain,
  total,
  weeks,
  factor,
  inputs,
  chains,
  route,
  nameOf,
  d,
  t,
  onJump,
}: {
  chain: string[]
  total: number
  weeks: number
  factor: number
  inputs: CpmInput[]
  chains: string[][]
  route: number
  nameOf: (c: string) => string
  d: (c: string) => number
  t: (c: string) => CpTimes
  onJump: (c: string) => void
}) {
  // Would taking one day off this step bring delivery forward? Not if another route is just as long.
  const helps = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const c of chain) {
      const r = computeCpm(inputs.map((x) => (x.code === c ? { ...x, days: Math.max(0, x.days - 1) } : x)))
      out[c] = r.ok && r.total < total
    }
    return out
  }, [chain, inputs, total])

  if (!chain.length || !total) return <Empty>No critical steps to show.</Empty>
  const others = [...new Set(chains.filter((_, j) => j !== route).flat())].filter((c) => !chain.includes(c))

  return (
    <>
      <Title title="Critical path, step by step" sub="Each bar starts when the step before it ends. The last bar ends on the dispatch day." />
      <div className="relative" style={cols(168)}>
        <Axis total={total} left="Step" right="Would shortening it help?" pill={168} />
        {chain.map((c, i) => {
          const x = t(c)
          return (
            <div key={c} style={rowGrid} onClick={() => onJump(c)} title={`${nameOf(c)} · takes ${fmt(d(c))} d · day ${fmt(x.es)} → ${fmt(x.ef)}`} className="min-h-[38px] cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-orange-50)]">
              <Label no={i + 1} title={short(nameOf(c))} sub={`${c} · day ${fmt(x.es)} → ${fmt(x.ef)}`} />
              <div className="relative h-[38px]">
                <Bar left={(x.es / total) * 100} width={(d(c) / total) * 100}>
                  {`${fmt(d(c))} d`}
                </Bar>
              </div>
              <div className="px-3">
                {helps[c] ? (
                  <Pill tone="yes">Yes, saves days</Pill>
                ) : (
                  <Pill tone="warn" title={`Another route is just as long: ${others.map((o) => short(nameOf(o))).join(', ')}`}>
                    Only with {others.slice(0, 2).map((o) => short(nameOf(o))).join(' + ') || 'a tied step'}
                  </Pill>
                )}
              </div>
            </div>
          )
        })}
        <div style={rowGrid} className="min-h-[46px] border-t-2 border-[var(--color-navy)] bg-[var(--color-surface)]">
          <Label no="=" title="Order to dispatch" sub="all steps above, one after another" muted />
          <div className="relative h-[38px]">
            <Bar left={0} width={100} tone="navy">{`${fmt(total)} days`}</Bar>
          </div>
          <div className="px-3 text-xs leading-tight text-[var(--color-ink-soft)]">
            <b className="text-[var(--color-ink)]">= {weeks} weeks</b>
            <br />
            {fmt(total)} ÷ 7 × {factor} safety
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------- 2. Days by phase ---------- */

function PhaseChart({ chain, total, rows, d }: { chain: string[]; total: number; rows: CpRow[]; d: (c: string) => number }) {
  if (!chain.length || !total) return <Empty>No critical steps to show.</Empty>
  const phaseOf = new Map(rows.map((r) => [r.code, r.phase]))
  const phases = [...new Set(rows.map((r) => r.phase))]
  const sums = phases.map((p) => {
    const mine = chain.filter((c) => phaseOf.get(c) === p)
    return { phase: p, days: mine.reduce((s, c) => s + d(c), 0), n: mine.length }
  })
  const max = Math.max(...sums.map((s) => s.days), 1)
  return (
    <>
      <Title title="Where the days go" sub={`Days each phase adds along the critical path. The bars add up to ${fmt(total)} days.`} />
      <div className="relative" style={cols(150)}>
        <div style={rowGrid} className="min-h-[34px] border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
          <div className="px-3">Phase</div>
          <div />
          <div className="px-3">Share of delivery</div>
        </div>
        {sums.map((s) => (
          <div key={s.phase} style={rowGrid} className="min-h-[38px] border-b border-[var(--color-border)]">
            <Label no={phaseNo(s.phase)} title={phaseName(s.phase)} sub={s.n ? `${s.n} critical step${s.n > 1 ? 's' : ''}` : 'none on the path'} muted={!s.days} />
            <div className="relative h-[38px]">
              {s.days ? (
                <Bar left={0} width={(s.days / max) * 100}>
                  {`${fmt(s.days)} d`}
                </Bar>
              ) : (
                <span className="absolute left-2 top-2.5 text-xs text-[var(--color-ink-faint)]">0 d</span>
              )}
            </div>
            <div className="px-3 text-sm font-semibold">{Math.round((s.days / total) * 100)}%</div>
          </div>
        ))}
        <div style={rowGrid} className="min-h-[46px] border-t-2 border-[var(--color-navy)] bg-[var(--color-surface)]">
          <Label no="=" title="Total" sub="critical path" muted />
          <div />
          <div className="px-3 text-sm font-semibold">{fmt(total)} days</div>
        </div>
      </div>
    </>
  )
}

/* ---------- 3. Spare time ---------- */

function SlackChart({ active, t, onJump }: { active: CpRow[]; t: (c: string) => CpTimes; onJump: (c: string) => void }) {
  const list = active.filter((r) => r.days > 0 && Math.abs(t(r.code).float) >= 1e-6).sort((a, b) => t(a.code).float - t(b.code).float)
  if (!list.length) return <Empty>Every active step is on the critical path, so none has spare time.</Empty>
  const max = Math.max(...list.map((r) => t(r.code).float), 1)
  return (
    <>
      <Title title="Spare time of the other activities" sub="How many days each one can slip without delaying delivery. Shortest bars are the ones to watch." />
      <div className="relative" style={cols(170)}>
        <div style={rowGrid} className="min-h-[34px] border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-faint)]">
          <div className="px-3">Activity</div>
          <div />
          <div className="px-3">Status</div>
        </div>
        {list.map((r) => {
          const fl = t(r.code).float
          const watch = fl <= 7
          return (
            <div key={r.code} style={rowGrid} onClick={() => onJump(r.code)} className="min-h-[38px] cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-orange-50)]">
              <Label no={r.code.replace(/^[A-Z]+/, '')} title={short(r.label)} sub={`${r.code} · takes ${fmt(r.days)} d`} muted />
              <div className="relative h-[38px]">
                <Bar left={0} width={Math.max((fl / max) * 100, 1.2)} tone={watch ? 'amber' : 'steel'}>
                  {`${fmt(fl)} d`}
                </Bar>
              </div>
              <div className="px-3">{watch ? <Pill tone="warn">Watch: little room</Pill> : <Pill tone="yes">Comfortable</Pill>}</div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-5 text-sm text-[var(--color-ink-faint)]">{children}</div>
}
