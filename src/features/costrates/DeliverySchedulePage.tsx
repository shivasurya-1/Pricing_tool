import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, History as HistoryIcon, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/EmptyState'
import { api, ApiError } from '@/lib/apiClient'
import { computeCpm, hasIgnoredDep, type CpmInput } from '@/lib/deliveryCpm'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { ACTIVITY_CODES, DELIVERY_ACTIVITIES, PRESET_DEPS, computeActivityDays, type DeliverySourcing } from '@/data/deliverySchedule'

/* ------------------------------------------------------------------ API shapes (backend/delivery) */

interface ActivityDto {
  id?: number // absent on a version snapshot
  code: string
  phase: string
  label: string
  sourcing: DeliverySourcing
  std_days: number
  override_days: number | null
  unit: string
  notes: string
  is_custom?: boolean
  included: boolean
  depends_on: string[]
  days: number
  es: number | null
  ef: number | null
  ls: number | null
  lf: number | null
  float: number | null
  critical: boolean
}
interface VersionInfo {
  id: number
  number: number
  version_label: string
  saved_by: string | null
  saved_by_id: number | null
  saved_at: string
  change_summary: string
  total_days: number
  delivery_weeks: number
  critical_codes: string[]
}
interface ScheduleDto {
  safety_factor: number
  activities: ActivityDto[]
  total_days: number
  delivery_weeks: number
  critical_codes: string[]
  current_version: VersionInfo | null
}
interface VersionDetail extends VersionInfo {
  safety_factor: number
  activities: ActivityDto[]
}

/** The server's own numbers for a row, from the last GET / save / reset / restore. */
interface Times {
  es: number
  ef: number
  ls: number
  lf: number
  float: number
  critical: boolean
}

/** One row of the sheet — numbers kept as typed text until saved. A workbook row is fixed
 * except Included, Sourcing, Std. Days, Override Days and Depends on; a row added on the page
 * (isCustom) can also be renamed, given notes and deleted. */
interface Row {
  isCustom: boolean
  key: string
  id?: number
  code: string
  included: boolean
  deps: string[]
  phase: string
  label: string
  sourcing: DeliverySourcing
  std: string
  override: string
  unit: string
  notes: string
  srv: Times | null
}

const SOURCING_OPTIONS: DeliverySourcing[] = ['In-house', 'Outsource', 'Logistics', '—']
// The workbook's phases, in order — a band stays (with its Add row) even if all its rows are deleted.
const WORKBOOK_PHASES = [...new Set(DELIVERY_ACTIVITIES.map((a) => a.phase.toUpperCase()))]
const phaseTitle = (phase: string) => phase.replace(/^PHASE \d+: /, '').toLowerCase().replace(/^./, (c) => c.toUpperCase())

let newRowCounter = 0

const toTimes = (a: ActivityDto): Times | null =>
  a.included && typeof a.es === 'number' && typeof a.ef === 'number' && typeof a.ls === 'number' && typeof a.lf === 'number' && typeof a.float === 'number'
    ? { es: a.es, ef: a.ef, ls: a.ls, lf: a.lf, float: a.float, critical: !!a.critical }
    : null

function toRows(dto: ScheduleDto): Row[] {
  return dto.activities.map((a) => ({
    isCustom: !!a.is_custom,
    key: String(a.id),
    id: a.id,
    code: a.code,
    included: a.included,
    deps: [...a.depends_on],
    phase: a.phase,
    label: a.label,
    sourcing: a.sourcing,
    std: String(a.std_days),
    override: a.override_days === null ? '' : String(a.override_days),
    unit: a.unit,
    notes: a.notes,
    srv: toTimes(a),
  }))
}

/** The workbook defaults, shown while the backend is unreachable (nothing is saved). */
function fallbackRows(): Row[] {
  return DELIVERY_ACTIVITIES.map((a) => {
    const code = ACTIVITY_CODES[a.key]
    const deps = PRESET_DEPS.A[code]
    return {
      isCustom: false,
      key: a.key,
      code,
      included: deps !== undefined,
      deps: [...(deps ?? [])],
      phase: a.phase.toUpperCase(),
      label: a.label,
      sourcing: a.sourcing,
      std: String(a.stdDays),
      override: a.overrideDays === undefined ? '' : String(a.overrideDays),
      unit: a.unit,
      notes: a.note ?? '',
      srv: null,
    }
  })
}

const parseDays = (text: string) => (text.trim() === '' ? undefined : Number(text))

/** The "Days used" rule: Outsource uses Override Days if filled in, else Std. Days · In-house / Logistics: Std. Days · —: 0 */
const rowDays = (r: Pick<Row, 'sourcing' | 'std' | 'override'>) => computeActivityDays(r.sourcing, parseDays(r.std) ?? 0, parseDays(r.override))

function fmtDays(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

const toCpmInput = (r: Row): CpmInput => {
  const d = rowDays(r)
  return { code: r.code, included: r.included, days: Number.isFinite(d) ? d : 0, deps: r.deps }
}

/** The PATCH body — also used to tell whether anything changed. */
function toPayload(rows: Row[], safetyFactor: string) {
  return {
    safety_factor: Number(safetyFactor),
    activities: rows.map((r) => ({
      ...(r.id !== undefined && { id: r.id }),
      sourcing: r.sourcing,
      std_days: parseDays(r.std) ?? 0,
      override_days: parseDays(r.override) ?? null,
      included: r.included,
      depends_on: r.deps,
      // Only for an added row — a workbook row keeps the sheet's own label and phase.
      ...(r.isCustom && { phase: r.phase, label: r.label.trim(), notes: r.notes }),
      // A new row names itself so other rows can link to it in the same save.
      ...(r.id === undefined && { code: r.code }),
    })),
  }
}

const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const cellInput =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-center text-sm outline-none hover:border-[var(--color-border)] focus:border-[var(--color-blue)] focus:bg-white'
const th = 'whitespace-nowrap border-r border-white/20 px-2 py-2 text-xs font-semibold text-white last:border-r-0'
const td = 'border-b border-[var(--color-border)] px-1.5 py-1 align-middle'

/**
 * The client workbook's "Delivery Schedule" sheet, standalone: days from order to dispatch.
 * TOTAL CALENDAR DAYS is the critical path through each row's "Depends on" links. The backend
 * is the source of truth for every total; while you have unsaved edits the page shows a live
 * preview from src/lib/deliveryCpm.ts (same rules), and the server's numbers come back on Save.
 */
export function DeliverySchedulePage() {
  const role = useAuthStore((s) => s.role)
  const pushToast = useUiStore((s) => s.pushToast)
  const [view, setView] = useState<'schedule' | 'history'>('schedule')
  const [rows, setRows] = useState<Row[]>([])
  const [safetyFactor, setSafetyFactor] = useState('1.2')
  const [server, setServer] = useState<ScheduleDto | null>(null)
  const [saved, setSaved] = useState('')
  const [summary, setSummary] = useState('')
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [addPhase, setAddPhase] = useState<string | null>(null)

  const apply = (dto: ScheduleDto) => {
    const next = toRows(dto)
    setServer(dto)
    setRows(next)
    setSafetyFactor(String(dto.safety_factor))
    setSaved(JSON.stringify(toPayload(next, String(dto.safety_factor))))
    setSaveErrors([])
    setSummary('')
  }

  useEffect(() => {
    api
      .get<ScheduleDto>('/delivery-schedule/')
      .then((dto) => {
        apply(dto)
        setStatus('ready')
      })
      .catch(() => {
        setRows(fallbackRows())
        setStatus('offline')
      })
  }, [])

  const mayEdit = role === 'Admin' || role === 'Sourcing'
  // Offline, anyone can try inputs (nothing is stored); online, only Admin and Sourcing can edit and save.
  const canEdit = status === 'offline' || (status === 'ready' && mayEdit)
  const dirty = status === 'ready' && JSON.stringify(toPayload(rows, safetyFactor)) !== saved
  // An older backend sends no critical-path fields; the live calculation covers for it.
  const serverHasCpm = !!server && Array.isArray(server.critical_codes) && typeof server.total_days === 'number'
  const useServer = status === 'ready' && !dirty && serverHasCpm

  const phases = useMemo(() => [...new Set([...WORKBOOK_PHASES, ...rows.map((r) => r.phase)])], [rows])
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, toCpmInput(r)])), [rows])
  const cpm = useMemo(() => computeCpm(rows.map(toCpmInput)), [rows])
  // `in` narrows the result the same way in every TypeScript setup (`!cpm.ok` needs strictNullChecks).
  const loop = 'cycle' in cpm ? cpm.cycle : null
  const factor = Number(safetyFactor) || 0

  // Server numbers when nothing is edited; a live preview from the same rules otherwise.
  const timeOf = (r: Row): Times | null => (useServer ? r.srv : cpm.ok ? (cpm.times[r.code] ?? null) : null)
  const total = useServer ? server!.total_days : cpm.ok ? cpm.total : 0
  const weeks = useServer ? server!.delivery_weeks : (total / 7) * factor
  const critical = useMemo(() => {
    if (useServer) return server!.critical_codes.map((c) => rows.find((r) => r.code === c)).filter((r): r is Row => !!r)
    if (!cpm.ok) return []
    return rows.filter((r) => cpm.times[r.code]?.critical).sort((a, b) => cpm.times[a.code].es - cpm.times[b.code].es || cpm.times[a.code].ef - cpm.times[b.code].ef)
  }, [useServer, server, rows, cpm])

  const invalid =
    !cpm.ok ||
    !(factor > 0) ||
    rows.some((r) => (r.isCustom && !r.label.trim()) || [parseDays(r.std), parseDays(r.override)].some((n) => n !== undefined && (Number.isNaN(n) || n < 0)))

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  // Links to a deleted row move to its own predecessors (B -> X -> A becomes B -> A), as on the server.
  const remove = (key: string) =>
    setRows((prev) => {
      const gone = prev.find((r) => r.key === key)
      if (!gone) return prev
      return prev
        .filter((r) => r.key !== key)
        .map((r) => (r.deps.includes(gone.code) ? { ...r, deps: [...new Set([...r.deps.filter((c) => c !== gone.code), ...gone.deps])].filter((c) => c !== r.code) } : r))
    })

  const nextCode = () => {
    const used = rows.map((r) => /^N(\d+)$/.exec(r.code)?.[1]).filter(Boolean).map(Number)
    return `N${Math.max(0, ...used) + 1}`
  }
  const addRow = (phase: string, draft: { label: string; sourcing: DeliverySourcing; std: string; override: string; deps: string[]; neededBy: string[] }) => {
    const code = nextCode()
    const row: Row = {
      isCustom: true,
      key: `new-${++newRowCounter}`,
      code,
      included: true,
      deps: draft.deps,
      phase,
      label: draft.label.trim(),
      sourcing: draft.sourcing,
      std: draft.std,
      override: draft.override,
      unit: 'days',
      notes: '',
      srv: null,
    }
    setRows((prev) => {
      const at = prev.map((r) => r.phase).lastIndexOf(phase) + 1
      const linked = prev.map((r) => (draft.neededBy.includes(r.code) ? { ...r, deps: [...r.deps, code] } : r))
      return [...linked.slice(0, at), row, ...linked.slice(at)]
    })
    setAddPhase(null)
  }

  /** Runs a save-type call; a 400 lists every message the backend sent. */
  const run = async (call: () => Promise<ScheduleDto>, ok: string, fail: string) => {
    setBusy(true)
    setSaveErrors([])
    try {
      apply(await call())
      pushToast(ok, 'success')
      return true
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setSaveErrors(err.errors)
      pushToast(err instanceof ApiError ? err.message : fail, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleSave = () =>
    run(
      () => api.patch<ScheduleDto>('/delivery-schedule/', { ...toPayload(rows, safetyFactor), ...(summary.trim() && { change_summary: summary.trim() }) }),
      'Delivery schedule saved.',
      'Failed to save the delivery schedule.',
    )

  const handleReset = async () => {
    if (status === 'offline') {
      setRows(fallbackRows())
      setSafetyFactor('1.2')
    } else {
      await run(() => api.post<ScheduleDto>('/delivery-schedule/reset/', {}), 'Delivery schedule reset to the workbook values.', 'Failed to reset the delivery schedule.')
    }
    setResetOpen(false)
  }

  const handleRestore = async (id: number) => {
    const done = await run(() => api.post<ScheduleDto>(`/delivery-schedule/versions/${id}/restore/`, {}), 'Version restored.', 'Failed to restore the version.')
    if (done) setView('schedule')
    return done
  }

  if (status === 'loading') return <EmptyState title="Loading delivery schedule..." />

  const cv = server?.current_version

  return (
    <div>
      <PageHeader
        title="Delivery Schedule"
        description="Days from order to dispatch — the client workbook's Delivery Schedule sheet. Standalone: not linked to any RFQ or other sheet."
        actions={
          <>
            {status === 'ready' && (
              <Button variant="secondary" icon={<HistoryIcon size={14} />} onClick={() => setView(view === 'history' ? 'schedule' : 'history')}>
                {view === 'history' ? 'Back to schedule' : 'History'}
              </Button>
            )}
            {canEdit && view === 'schedule' && (
              <>
                <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setResetOpen(true)} disabled={busy}>
                  Reset to Workbook Values
                </Button>
                <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} disabled={status === 'offline' || !dirty || invalid || busy} title={status === 'offline' ? 'Backend not reachable' : undefined}>
                  {busy ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}
          </>
        }
      />

      {cv && (
        <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
          Current version <b>{cv.version_label}</b> · saved by {cv.saved_by ?? 'unknown'} · {fmtWhen(cv.saved_at)}
          {cv.change_summary && <> · “{cv.change_summary}”</>}
        </p>
      )}

      {view === 'history' && status === 'ready' && <HistoryView canRestore={mayEdit} busy={busy} currentId={cv?.id ?? null} onRestore={handleRestore} />}

      {view === 'schedule' && (
        <>
          {status === 'offline' && (
            <div className="mb-4 rounded-md border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-4 py-2.5 text-sm text-[var(--color-amber)]">
              Backend not reachable — you can still change any value and watch the schedule update, but nothing is saved.
            </div>
          )}
          {status === 'ready' && !mayEdit && (
            <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-2.5 text-sm text-[var(--color-ink-soft)]">
              View only — you are signed in as <b>{role}</b>. Switch to the Sourcing or Admin role to change sourcing, days and dependencies.
            </div>
          )}
          {saveErrors.length > 0 && (
            <div role="alert" className="mb-4 rounded-md border border-[var(--color-red-100)] bg-[var(--color-red-50)] px-4 py-2.5 text-sm text-[var(--color-red)]">
              <div className="flex items-start justify-between gap-3">
                <b>The schedule could not be saved:</b>
                <button type="button" onClick={() => setSaveErrors([])} aria-label="Dismiss" className="shrink-0">
                  <X size={14} />
                </button>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {saveErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {dirty && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-2.5 text-sm text-[var(--color-blue)]">
              <span>
                You have unsaved changes — the totals below are a live preview. Click <b>Save</b> for the server's figures.
              </span>
              {canEdit && (
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={200}
                  placeholder="Change summary (optional)"
                  aria-label="Change summary"
                  className="ml-auto w-72 max-w-full rounded border border-[var(--color-blue-100)] bg-white px-2 py-1 text-xs text-[var(--color-ink)]"
                />
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="bg-[var(--color-navy)] px-4 py-3 text-center text-sm font-bold tracking-wide text-white sm:text-base">
              DRIVE PULLEY — INDIA DELIVERY SCHEDULE <span className="mx-2 opacity-60">|</span> Days from order to dispatch
            </div>
            <div className="bg-[var(--color-navy-700)] px-3 py-2 text-sm font-semibold text-white">
              Sourcing selection (<span className="text-[#FDE68A]">Yellow</span> = override) drives delivery time automatically
            </div>

            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[1300px] border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={clsx(th, 'bg-[var(--color-orange)]')}>Included</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-left')}>ID</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)] text-left')}>Process / Activity</th>
                    <th className={clsx(th, 'min-w-[132px] bg-[var(--color-blue)]')}>Sourcing</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)]')}>Std. Days</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)]')}>Override Days</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)]')}>Days used</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-left')}>Depends on</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-right')}>Start</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-right')}>Finish</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-right')}>Float</th>
                    <th className={clsx(th, 'bg-[var(--color-orange)] text-left')}>Timeline</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)] text-left')}>Notes</th>
                    <th className={clsx(th, 'bg-[var(--color-blue)]')}>
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((phase) => (
                    <Fragment key={phase}>
                      <tr>
                        <td colSpan={14} className="border-b border-[var(--color-border)] bg-[var(--color-teal-50)] px-3 py-1 text-sm font-bold text-[var(--color-ink)]">
                          <div className="flex items-center justify-between">
                            <span className="py-0.5">— {phase} —</span>
                            {canEdit && (
                              <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setAddPhase(phase)} aria-label={`Add row to ${phase}`}>
                                Add row
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {rows
                        .filter((r) => r.phase === phase)
                        .map((r) => {
                          const t = r.included ? timeOf(r) : null
                          const crit = !!t?.critical
                          const badDeps = hasIgnoredDep(toCpmInput(r), byCode)
                          return (
                            <tr key={r.key} className={clsx(r.included ? 'bg-white' : 'bg-[var(--color-surface)] text-[var(--color-ink-soft)]', crit && 'shadow-[inset_3px_0_0_var(--color-orange)]')}>
                              <td className={clsx(td, 'text-center')}>
                                <input
                                  type="checkbox"
                                  checked={r.included}
                                  disabled={!canEdit}
                                  onChange={(e) => update(r.key, { included: e.target.checked })}
                                  aria-label={`${r.label || r.code} is included in the schedule`}
                                />
                              </td>
                              <td className={clsx(td, 'font-mono text-[11px] text-[var(--color-ink-faint)]')}>{r.code}</td>
                              <td className={clsx(td, 'min-w-[210px]')}>
                                <div className="flex items-center gap-1.5">
                                  {r.isCustom && canEdit ? (
                                    <input
                                      value={r.label}
                                      onChange={(e) => update(r.key, { label: e.target.value })}
                                      placeholder="New activity name"
                                      aria-label="Activity name"
                                      className={clsx(cellInput, 'text-left', !r.label.trim() && 'border-[var(--color-red)]', crit && 'font-bold')}
                                    />
                                  ) : (
                                    <span className={clsx('px-1', crit && 'font-bold')}>{r.label}</span>
                                  )}
                                  {r.isCustom && <span className="shrink-0 rounded-full bg-[var(--color-green-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-green)]">Added</span>}
                                  {!r.included && <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ink-faint)]">Excluded</span>}
                                </div>
                              </td>
                              <td className={clsx(td, 'min-w-[132px] bg-[var(--color-amber-50)]')}>
                                {canEdit ? (
                                  <select
                                    value={r.sourcing}
                                    onChange={(e) => update(r.key, { sourcing: e.target.value as DeliverySourcing })}
                                    aria-label={`${r.label || r.code} sourcing`}
                                    className={clsx(cellInput, 'min-w-[116px] cursor-pointer text-left')}
                                  >
                                    {SOURCING_OPTIONS.map((o) => (
                                      <option key={o} value={o}>
                                        {o}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="text-center">{r.sourcing}</div>
                                )}
                              </td>
                              <td className={clsx(td, 'w-[76px]')}>
                                {canEdit ? (
                                  <input type="number" min={0} step="any" value={r.std} onChange={(e) => update(r.key, { std: e.target.value })} aria-label={`${r.label || r.code} std. days`} className={cellInput} />
                                ) : (
                                  <div className="text-center">{r.std}</div>
                                )}
                              </td>
                              <td className={clsx(td, 'w-[88px] bg-[var(--color-amber-50)]')}>
                                {canEdit ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={r.override}
                                    onChange={(e) => update(r.key, { override: e.target.value })}
                                    aria-label={`${r.label || r.code} override days`}
                                    title="Only used when the row is Outsourced"
                                    className={cellInput}
                                  />
                                ) : (
                                  <div className="text-center">{r.override}</div>
                                )}
                              </td>
                              <td
                                className={clsx(td, 'bg-[var(--color-blue-50)] text-center font-semibold tabular-nums text-[var(--color-blue)]')}
                                title="Outsource: Override Days if filled in, else Std. Days · In-house / Logistics: Std. Days · —: 0"
                              >
                                {fmtDays(rowDays(r))} d
                              </td>
                              <td className={td}>
                                <DepsPicker
                                  value={r.deps}
                                  self={r.code}
                                  options={rows}
                                  disabled={!canEdit}
                                  bad={badDeps}
                                  label={`${r.label || r.code} depends on`}
                                  onChange={(deps) => update(r.key, { deps })}
                                />
                              </td>
                              <td className={clsx(td, 'text-right tabular-nums')}>{t ? fmtDays(t.es) : '—'}</td>
                              <td className={clsx(td, 'text-right tabular-nums')}>{t ? fmtDays(t.ef) : '—'}</td>
                              <td className={clsx(td, 'text-right tabular-nums')}>
                                {!t ? (
                                  '—'
                                ) : crit ? (
                                  <span className="rounded bg-[var(--color-orange-100)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-orange)]">CRITICAL</span>
                                ) : (
                                  fmtDays(t.float)
                                )}
                              </td>
                              <td className={clsx(td, 'min-w-[140px]')}>
                                <div className="relative h-2.5 rounded bg-[var(--color-surface)]" aria-hidden="true">
                                  {t && total > 0 && t.ef > t.es && (
                                    <div
                                      className={clsx('absolute top-0.5 h-1.5 rounded-sm', crit ? 'bg-[var(--color-orange)]' : 'bg-[#9aa7c4]')}
                                      style={{ left: `${(t.es / total) * 100}%`, width: `${Math.max(((t.ef - t.es) / total) * 100, 0.8)}%` }}
                                    />
                                  )}
                                </div>
                              </td>
                              <td className={clsx(td, 'min-w-[130px] text-xs italic text-[var(--color-ink-soft)]')}>
                                {r.isCustom && canEdit ? (
                                  <input value={r.notes} onChange={(e) => update(r.key, { notes: e.target.value })} placeholder="Notes" aria-label="Notes" className={clsx(cellInput, 'text-left text-xs italic')} />
                                ) : (
                                  <span className="px-1 leading-snug">{r.notes}</span>
                                )}
                              </td>
                              <td className={clsx(td, 'text-center')}>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => remove(r.key)}
                                    aria-label={`Delete ${r.label || 'new row'}`}
                                    title="Delete this row — rows that waited for it wait for its predecessors instead. Reset to Workbook Values brings workbook rows back."
                                    className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-red-50)] hover:text-[var(--color-red)]"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {loop && (
              <div role="alert" className="border-t border-[var(--color-red-100)] bg-[var(--color-red-50)] px-4 py-2 text-sm font-semibold text-[var(--color-red)]">
                Circular dependency between: {loop.join(', ')}. Remove one link so the chain has a start and an end.
              </div>
            )}

            <div className="space-y-2 p-4">
              <div className="flex flex-wrap items-stretch overflow-hidden rounded-md">
                <div className="flex flex-1 items-center bg-[var(--color-navy)] px-4 py-2.5 text-sm font-bold text-white sm:text-base">TOTAL CALENDAR DAYS (critical path)</div>
                <div className="flex w-28 items-center justify-center bg-[var(--color-orange)] text-lg font-bold text-white">{useServer || cpm.ok ? `${fmtDays(total)} d` : '—'}</div>
                <div className="flex w-24 items-center justify-center border-l border-white/30 bg-[var(--color-orange)] text-xs text-white">{useServer ? 'calendar' : 'preview'}</div>
              </div>
              <div className="flex flex-wrap items-stretch overflow-hidden rounded-md border border-[var(--color-green-100)]">
                <div className="flex flex-1 flex-wrap items-center gap-2 bg-[var(--color-green-50)] px-4 py-2.5 text-sm font-bold text-[var(--color-ink)] sm:text-base">
                  → Delivery Weeks (÷7, apply safety factor
                  {canEdit ? (
                    <input
                      type="number"
                      min={0}
                      step="0.05"
                      value={safetyFactor}
                      onChange={(e) => setSafetyFactor(e.target.value)}
                      aria-label="Safety factor"
                      className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-amber-50)] px-1.5 py-0.5 text-center text-sm font-semibold"
                    />
                  ) : (
                    <span>{safetyFactor}</span>
                  )}
                  )
                </div>
                <div className="flex w-52 items-center justify-center bg-[var(--color-green-50)] text-xl font-bold text-[var(--color-ink)]" title={useServer || cpm.ok ? `${weeks.toFixed(2)} weeks` : undefined}>
                  {useServer || cpm.ok ? `${Math.round(weeks)} wks` : '—'}
                </div>
              </div>
              <div className="rounded-md border border-[var(--color-orange-100)] bg-[var(--color-orange-50)] px-4 py-2.5 text-xs text-[var(--color-ink)]">
                <b>Critical activities (float 0):</b> {critical.length === 0 && '—'}
                {critical.map((r) => (
                  <span key={r.key} className="mr-1 inline-block rounded bg-[var(--color-orange-100)] px-1.5 py-0.5 text-[11px] text-[var(--color-orange)]">
                    {r.code} {r.label} · {fmtDays(rowDays(r))}d
                  </span>
                ))}
              </div>
              <p className="rounded-md bg-[var(--color-blue-50)] px-4 py-3 text-xs italic text-[var(--color-ink-soft)]">
                NOTE: Actual lead time is driven by the CRITICAL PATH, the longest chain of activities that wait on each other. An activity with float can slip that many days
                without delaying delivery. An excluded row counts as 0 days, and rows that waited for it wait for its predecessors instead.
              </p>
            </div>
          </Card>
        </>
      )}

      {addPhase !== null && <AddRowDialog key={addPhase} phase={addPhase} rows={rows} baseTotal={cpm.ok ? cpm.total : 0} onClose={() => setAddPhase(null)} onAdd={(draft) => addRow(addPhase, draft)} />}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Reset Delivery Schedule"
        description="Put every Sourcing, Std. Days and Override Days value, every Included tick and Depends on link, and the safety factor back to the client workbook's (139 days, factor 1.2), and remove the rows you added? This is saved as a new version."
        confirmLabel="Reset"
        danger
      />
    </div>
  )
}

/* ---------- Depends on: pick the rows this one waits for (by code) ---------- */

function DepsPicker({ value, self, options, disabled, bad, label, onChange }: { value: string[]; self: string; options: Row[]; disabled: boolean; bad: boolean; label: string; onChange: (v: string[]) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const outside = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    // Scrolling the list inside the panel must not close it; scrolling the page does.
    const scroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [pos])

  const toggleOpen = () => {
    if (pos) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    const height = 280
    setPos({ top: r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) })
  }
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code])
  const known = new Set(options.map((o) => o.code))
  const unknown = value.filter((c) => !known.has(c) || c === self)

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-label={label}
        aria-expanded={!!pos}
        title={bad ? 'Contains an unknown code or the row itself: ignored' : undefined}
        className={clsx(
          'flex w-32 items-center justify-between gap-1 rounded border bg-white px-1.5 py-1 text-left font-mono text-xs disabled:bg-transparent',
          bad ? 'border-[var(--color-red)] bg-[var(--color-red-50)]' : 'border-[var(--color-border)]',
        )}
      >
        <span className="truncate">{value.length ? value.join(', ') : <span className="text-[var(--color-ink-faint)]">day 0</span>}</span>
        {!disabled && <ChevronDown size={12} className="shrink-0 text-[var(--color-ink-faint)]" />}
      </button>
      {pos &&
        createPortal(
          <div ref={panel} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="z-[60] max-h-[280px] w-72 overflow-auto rounded-md border border-[var(--color-border)] bg-white p-1 shadow-lg" role="group" aria-label={label}>
            {options
              .filter((o) => o.code !== self)
              .map((o) => (
                <label key={o.code} className={clsx('flex cursor-pointer items-center gap-2 rounded px-1.5 py-0.5 text-sm hover:bg-[var(--color-surface)]', !o.included && 'text-[var(--color-ink-faint)]')}>
                  <input type="checkbox" checked={value.includes(o.code)} onChange={() => toggle(o.code)} />
                  <span className="min-w-9 font-mono text-[11px] text-[var(--color-ink-faint)]">{o.code}</span>
                  <span className="truncate">{o.label || 'New activity'}</span>
                </label>
              ))}
            {unknown.length > 0 && (
              <button type="button" onClick={() => onChange(value.filter((c) => !unknown.includes(c)))} className="mt-1 w-full rounded border border-[var(--color-red-100)] px-2 py-1 text-xs text-[var(--color-red)]">
                Remove unknown codes ({unknown.join(', ')})
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

/* ---------- Add row dialog: shows what the new row does to delivery before it is added ---------- */

interface Draft {
  label: string
  sourcing: DeliverySourcing
  std: string
  override: string
  deps: string[]
  neededBy: string[]
}

function AddRowDialog({ phase, rows, baseTotal, onClose, onAdd }: { phase: string; rows: Row[]; baseTotal: number; onClose: () => void; onAdd: (d: Draft) => void }) {
  const [label, setLabel] = useState('')
  const [sourcing, setSourcing] = useState<DeliverySourcing>('In-house')
  const [std, setStd] = useState('1')
  const [override, setOverride] = useState('')
  const [deps, setDeps] = useState<string[]>([])
  const [neededBy, setNeededBy] = useState<string[]>([])
  const options = rows.filter((r) => r.included)

  const days = rowDays({ sourcing, std, override })
  const result = useMemo(() => {
    const list: CpmInput[] = rows.map((r) => {
      const c = toCpmInput(r)
      return neededBy.includes(r.code) ? { ...c, deps: [...c.deps, 'NEW'] } : c
    })
    list.push({ code: 'NEW', included: true, days: Number.isFinite(days) ? days : 0, deps })
    return computeCpm(list)
  }, [rows, neededBy, deps, days])

  const toggle = (set: string[], code: string) => (set.includes(code) ? set.filter((c) => c !== code) : [...set, code])
  const canAdd = !!label.trim() && result.ok && Number.isFinite(days) && days >= 0

  const newTimes = result.ok ? result.times.NEW : undefined
  const delta = result.ok ? result.total - baseTotal : 0
  const warnings: string[] = []
  if (!deps.length) warnings.push('Nothing selected under “Depends on”: this row starts on day 0.')
  if (!neededBy.length && deps.length) warnings.push('Nothing waits for this row. It only matters if it ends after the other last steps.')
  if (!neededBy.length && !deps.length) warnings.push('This row is not linked to anything, so it only matters if it is longer than the whole schedule.')

  const list = (title: string, set: string[], setter: (s: string[]) => void) => (
    <fieldset>
      <legend className="mb-1 text-xs text-[var(--color-ink-soft)]">{title}</legend>
      <div className="max-h-44 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
        {options.map((r) => (
          <label key={r.code} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" checked={set.includes(r.code)} onChange={() => setter(toggle(set, r.code))} />
            <span className="min-w-8 font-mono text-[11px] text-[var(--color-ink-faint)]">{r.code}</span>
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  )

  const field = 'w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm'
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <span>
          Add row <span className="ml-2 text-xs font-normal text-[var(--color-ink-faint)]">Phase: {phaseTitle(phase)}</span>
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canAdd} onClick={() => onAdd({ label, sourcing, std, override, deps, neededBy })}>
            Add row
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
        <label className="text-xs text-[var(--color-ink-soft)]">
          Activity
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canAdd && onAdd({ label, sourcing, std, override, deps, neededBy })}
            placeholder="e.g. Third-party inspection"
            className={field}
          />
        </label>
        <label className="text-xs text-[var(--color-ink-soft)]">
          Sourcing
          <select value={sourcing} onChange={(e) => setSourcing(e.target.value as DeliverySourcing)} className={field}>
            {SOURCING_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--color-ink-soft)]">
          Std. days
          <input type="number" min={0} step="any" value={std} onChange={(e) => setStd(e.target.value)} className={field} />
        </label>
        <label className="text-xs text-[var(--color-ink-soft)]">
          Override days
          <input type="number" min={0} step="any" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="optional" className={field} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {list('Depends on (this row waits for)', deps, setDeps)}
        {list('Needed by (these rows wait for it)', neededBy, setNeededBy)}
      </div>

      <div aria-live="polite" className="mt-3">
        {!result.ok ? (
          <div className="rounded-md bg-[var(--color-red-50)] px-3 py-2 text-sm text-[var(--color-red)]">
            <b>This creates a loop.</b> A row cannot wait for something that waits for it. Remove one link.
          </div>
        ) : newTimes?.critical ? (
          <div className="rounded-md bg-[var(--color-orange-100)] px-3 py-2 text-sm text-[var(--color-orange)]">
            <b>Critical.</b> Delivery becomes <b>{fmtDays(result.total)} days</b> ({delta > 0 ? `+${fmtDays(delta)}` : delta === 0 ? 'no change' : fmtDays(delta)}). Any slip on this row slips delivery.
          </div>
        ) : (
          <div className="rounded-md bg-[var(--color-green-50)] px-3 py-2 text-sm text-[var(--color-green)]">
            <b>Not critical.</b> It has <b>{fmtDays(newTimes?.float ?? 0)} days of float</b>, so it can slip that much. Delivery stays <b>{fmtDays(result.total)} days</b>.
          </div>
        )}
        {warnings.map((w) => (
          <div key={w} className="mt-1.5 rounded-md bg-[var(--color-amber-50)] px-3 py-1.5 text-xs text-[var(--color-amber)]">
            {w}
          </div>
        ))}
      </div>
    </Modal>
  )
}

/* ---------- History: every saved version, a read-only view of one, and Restore ---------- */

function HistoryView({ canRestore, busy, currentId, onRestore }: { canRestore: boolean; busy: boolean; currentId: number | null; onRestore: (id: number) => Promise<boolean> }) {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<VersionDetail | null>(null)
  const [failedId, setFailedId] = useState<number | null>(null)
  const [restoreId, setRestoreId] = useState<number | null>(null)

  useEffect(() => {
    api
      .get<VersionInfo[]>('/delivery-schedule/versions/')
      .then((v) => {
        setVersions(v)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [currentId])

  useEffect(() => {
    if (openId === null) return
    let live = true
    api
      .get<VersionDetail>(`/delivery-schedule/versions/${openId}/`)
      .then((d) => live && setLoaded(d))
      .catch(() => live && setFailedId(openId))
    return () => {
      live = false
    }
  }, [openId])

  if (failed) return <EmptyState title="Could not load the version history." />
  if (!versions) return <EmptyState title="Loading version history..." />

  // Only the version that is open counts, so a slow earlier request never shows the wrong table.
  const detail = loaded && loaded.id === openId ? loaded : null
  const detailFailed = failedId === openId
  const phases = detail ? [...new Set(detail.activities.map((a) => a.phase))] : []
  const restoring = versions.find((v) => v.id === restoreId)

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--color-navy)] text-left text-xs text-white">
                {['Version', 'Total days', 'Weeks', 'Saved by', 'Saved at', 'Change summary', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--color-ink-faint)]">
                    No versions saved yet. Save the schedule to create the first one.
                  </td>
                </tr>
              )}
              {versions.map((v) => (
                <tr key={v.id} className={clsx('border-b border-[var(--color-border)]', openId === v.id && 'bg-[var(--color-blue-50)]')}>
                  <td className="px-3 py-2 font-semibold">
                    {v.version_label}
                    {v.id === currentId && <span className="ml-2 rounded-full bg-[var(--color-green-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-green)]">Current</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtDays(v.total_days)} d</td>
                  <td className="px-3 py-2 tabular-nums">{Math.round(v.delivery_weeks)}</td>
                  <td className="px-3 py-2">{v.saved_by ?? 'unknown'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtWhen(v.saved_at)}</td>
                  <td className="px-3 py-2 text-[var(--color-ink-soft)]">{v.change_summary || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
                      {openId === v.id ? 'Hide' : 'View'}
                    </Button>
                    {canRestore && v.id !== currentId && (
                      <Button size="sm" className="ml-2" disabled={busy} onClick={() => setRestoreId(v.id)}>
                        Restore
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {openId !== null && (
        <Card className="overflow-hidden">
          {detailFailed ? (
            <EmptyState title="Could not load this version." />
          ) : !detail ? (
            <EmptyState title="Loading version..." />
          ) : (
            <>
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm">
                <b>{detail.version_label}</b> (read-only) · {fmtDays(detail.total_days)} days · {Math.round(detail.delivery_weeks)} weeks at factor {detail.safety_factor}
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[960px] border-collapse text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-[var(--color-blue)] text-left text-xs text-white">
                      {['Included', 'ID', 'Process / Activity', 'Sourcing', 'Std.', 'Override', 'Days used', 'Depends on', 'Start', 'Finish', 'Float'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {phases.map((ph) => (
                      <Fragment key={ph}>
                        <tr>
                          <td colSpan={11} className="bg-[var(--color-teal-50)] px-3 py-1 text-xs font-bold">
                            — {ph} —
                          </td>
                        </tr>
                        {detail.activities
                          .filter((a) => a.phase === ph)
                          .map((a) => (
                            <tr key={a.code} className={clsx('border-b border-[var(--color-border)]', !a.included && 'text-[var(--color-ink-faint)]', a.critical && 'font-semibold shadow-[inset_3px_0_0_var(--color-orange)]')}>
                              <td className="px-2 py-1 text-center">{a.included ? '✓' : '—'}</td>
                              <td className="px-2 py-1 font-mono text-[11px]">{a.code}</td>
                              <td className="px-2 py-1">{a.label}</td>
                              <td className="px-2 py-1">{a.sourcing}</td>
                              <td className="px-2 py-1 tabular-nums">{fmtDays(a.std_days)}</td>
                              <td className="px-2 py-1 tabular-nums">{a.override_days === null ? '' : fmtDays(a.override_days)}</td>
                              <td className="px-2 py-1 tabular-nums">{fmtDays(a.days)} d</td>
                              <td className="px-2 py-1 font-mono text-xs">{a.depends_on.join(', ') || 'day 0'}</td>
                              <td className="px-2 py-1 tabular-nums">{a.es === null ? '—' : fmtDays(a.es)}</td>
                              <td className="px-2 py-1 tabular-nums">{a.ef === null ? '—' : fmtDays(a.ef)}</td>
                              <td className="px-2 py-1 tabular-nums">
                                {a.critical ? <span className="rounded bg-[var(--color-orange-100)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-orange)]">CRITICAL</span> : a.float === null ? '—' : fmtDays(a.float)}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={restoreId !== null}
        onClose={() => setRestoreId(null)}
        onConfirm={async () => {
          if (restoreId !== null) await onRestore(restoreId)
          setRestoreId(null)
        }}
        title={`Restore ${restoring?.version_label ?? 'version'}`}
        description="This replaces the live sheet with that version and saves the result as a new version. Nothing in the history is deleted."
        confirmLabel="Restore"
      />
    </div>
  )
}
