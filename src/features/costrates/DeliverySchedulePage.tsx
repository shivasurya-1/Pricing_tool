import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { api, ApiError } from '@/lib/apiClient'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { DELIVERY_ACTIVITIES, MAX_GROUP_KEYS, SUM_GROUP_KEYS, computeActivityDays, type DeliverySourcing } from '@/data/deliverySchedule'

type TotalGroup = 'max' | 'sum' | 'none'

/** GET/PATCH /api/delivery-schedule/ — see backend/delivery/views.py. */
interface ActivityDto {
  id: number
  phase: string
  label: string
  sourcing: DeliverySourcing
  std_days: number
  override_days: number | null
  unit: string
  notes: string
  total_group: TotalGroup
  is_custom: boolean
}
interface ScheduleDto {
  safety_factor: number
  activities: ActivityDto[]
}

/** One row of the sheet — numbers kept as typed text until saved. A workbook row is
 * fixed except Sourcing, Std. Days and Override Days; a row added on the page
 * (isCustom) can also be renamed, given notes, re-grouped in the total and deleted. */
interface Row {
  isCustom: boolean
  key: string
  id?: number
  phase: string
  label: string
  sourcing: DeliverySourcing
  std: string
  override: string
  unit: string
  notes: string
  totalGroup: TotalGroup
}

const SOURCING_OPTIONS: DeliverySourcing[] = ['In-house', 'Outsource', 'Logistics', '—']
// Shown under an added row: how it counts, which follows its phase like the workbook's
// formula =MAX(F28:F32)+F6+F7+... (Phase 3 is the MAX() group, Phase 1 isn't in it).
const COUNT_NOTE: Record<TotalGroup, string> = {
  sum: 'Added to total days',
  max: 'Counts only if longer than the other purchased parts',
  none: 'Not in total — runs in parallel',
}
// The workbook's phases, in order — a band stays (with its Add row) even if all its rows are deleted.
const WORKBOOK_PHASES = [...new Set(DELIVERY_ACTIVITIES.map((a) => a.phase.toUpperCase()))]

let newRowCounter = 0

function toRows(dto: ScheduleDto): Row[] {
  return dto.activities.map((a) => ({
    isCustom: a.is_custom,
    key: String(a.id),
    id: a.id,
    phase: a.phase,
    label: a.label,
    sourcing: a.sourcing,
    std: String(a.std_days),
    override: a.override_days === null ? '' : String(a.override_days),
    unit: a.unit,
    notes: a.notes,
    totalGroup: a.total_group,
  }))
}

/** The workbook defaults (src/data/deliverySchedule.ts), shown read-only while the backend is unreachable. */
function fallbackRows(): Row[] {
  return DELIVERY_ACTIVITIES.map((a) => ({
    isCustom: false,
    key: a.key,
    phase: a.phase.toUpperCase(),
    label: a.label,
    sourcing: a.sourcing,
    std: String(a.stdDays),
    override: a.overrideDays === undefined ? '' : String(a.overrideDays),
    unit: a.unit,
    notes: a.note ?? '',
    totalGroup: MAX_GROUP_KEYS.includes(a.key) ? 'max' : SUM_GROUP_KEYS.includes(a.key) ? 'sum' : 'none',
  }))
}

// How a row added to each phase counts — the same as that phase's workbook rows
// (backend/delivery/defaults.py's PHASE_TOTAL_GROUP).
const PHASE_TOTAL_GROUP: Record<string, TotalGroup> = Object.fromEntries(fallbackRows().map((r) => [r.phase, r.totalGroup]))

const parseDays = (text: string) => (text.trim() === '' ? undefined : Number(text))

/** The workbook's Unit column: =IF(C="Outsource",IF(E<>"",E,D),IF(C="In-house",D,IF(C="Logistics",D,0))) */
const rowDays = (r: Row) => computeActivityDays(r.sourcing, parseDays(r.std) ?? 0, parseDays(r.override))

function fmtDays(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** The PATCH body — also used to tell whether anything changed. */
function toPayload(rows: Row[], safetyFactor: string) {
  return {
    safety_factor: Number(safetyFactor),
    activities: rows.map((r) => ({
      id: r.id ?? null,
      sourcing: r.sourcing,
      std_days: parseDays(r.std) ?? 0,
      override_days: parseDays(r.override) ?? null,
      // Only saved for an added row — a workbook row keeps the sheet's own. How it counts
      // in the total follows its phase (set by the backend).
      ...(r.isCustom && { phase: r.phase, label: r.label.trim(), notes: r.notes }),
    })),
  }
}

const cellInput =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-center text-sm outline-none hover:border-[var(--color-border)] focus:border-[var(--color-blue)] focus:bg-white'
// Activity | Sourcing | Std. | Override | Days | unit | Notes | delete
const COLUMNS = 'minmax(190px,2.4fr) 116px 76px 88px 66px 52px minmax(130px,1.6fr) 36px'

/**
 * The client workbook's "Delivery Schedule" sheet, standalone: days from order to dispatch.
 * Exactly the workbook's rows; Sourcing, Std. Days and Override Days are its input cells,
 * and TOTAL CALENDAR DAYS is its formula =MAX(F28:F32)+F6+F7+F23+F24+F25+F26+F34+F35+F37+F38+F39.
 */
export function DeliverySchedulePage() {
  const role = useAuthStore((s) => s.role)
  const pushToast = useUiStore((s) => s.pushToast)
  const [rows, setRows] = useState<Row[]>([])
  const [safetyFactor, setSafetyFactor] = useState('1.2')
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const apply = (dto: ScheduleDto) => {
    const next = toRows(dto)
    setRows(next)
    setSafetyFactor(String(dto.safety_factor))
    setSaved(JSON.stringify(toPayload(next, String(dto.safety_factor))))
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

  const canEdit = status === 'ready' && (role === 'Admin' || role === 'Sourcing')
  const dirty = status === 'ready' && JSON.stringify(toPayload(rows, safetyFactor)) !== saved

  const phases = useMemo(() => [...new Set([...WORKBOOK_PHASES, ...rows.map((r) => r.phase)])], [rows])
  const days = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, rowDays(r)])), [rows])
  // MAX(F28:F32) — the parallel purchased components — plus every other row of the formula.
  const maxGroup = Math.max(0, ...rows.filter((r) => r.totalGroup === 'max').map((r) => days[r.key]))
  const sumGroup = rows.filter((r) => r.totalGroup === 'sum').reduce((s, r) => s + days[r.key], 0)
  const totalDays = maxGroup + sumGroup
  const factor = Number(safetyFactor) || 0
  const weeks = (totalDays / 7) * factor

  const invalid =
    !(factor > 0) ||
    rows.some((r) => (r.isCustom && !r.label.trim()) || [parseDays(r.std), parseDays(r.override)].some((n) => n !== undefined && (Number.isNaN(n) || n < 0)))

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key))
  // A new row goes at the end of its phase; by default its days are added to the total.
  const addRow = (phase: string) =>
    setRows((prev) => {
      const at = prev.map((r) => r.phase).lastIndexOf(phase) + 1
      const totalGroup = PHASE_TOTAL_GROUP[phase] ?? 'sum'
      const row: Row = { isCustom: true, key: `new-${++newRowCounter}`, phase, label: '', sourcing: 'In-house', std: '0', override: '', unit: 'days', notes: '', totalGroup }
      return [...prev.slice(0, at), row, ...prev.slice(at)]
    })

  const handleSave = async () => {
    setBusy(true)
    try {
      apply(await api.patch<ScheduleDto>('/delivery-schedule/', toPayload(rows, safetyFactor)))
      pushToast('Delivery schedule saved.', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to save the delivery schedule.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleReset = async () => {
    setBusy(true)
    try {
      apply(await api.post<ScheduleDto>('/delivery-schedule/reset/', {}))
      pushToast('Delivery schedule reset to the workbook values.', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to reset the delivery schedule.', 'error')
    } finally {
      setBusy(false)
      setResetOpen(false)
    }
  }

  if (status === 'loading') return <EmptyState title="Loading delivery schedule..." />

  return (
    <div>
      <PageHeader
        title="Delivery Schedule"
        description="Days from order to dispatch — the client workbook's Delivery Schedule sheet. Standalone: not linked to any RFQ or other sheet."
        actions={
          canEdit && (
            <>
              <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setResetOpen(true)} disabled={busy}>
                Reset to Workbook Values
              </Button>
              <Button variant="primary" icon={<Save size={14} />} onClick={handleSave} disabled={!dirty || invalid || busy}>
                {busy ? 'Saving...' : 'Save'}
              </Button>
            </>
          )
        }
      />

      {status === 'offline' && (
        <div className="mb-4 rounded-md border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-4 py-2.5 text-sm text-[var(--color-amber)]">
          Backend not reachable — showing the workbook values, read-only. Changes can be made once the backend is running.
        </div>
      )}
      {dirty && (
        <div className="mb-4 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-2.5 text-sm text-[var(--color-blue)]">
          You have unsaved changes — click <b>Save</b> to keep them.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="bg-[var(--color-navy)] px-4 py-3 text-center text-sm font-bold tracking-wide text-white sm:text-base">
          DRIVE PULLEY — INDIA DELIVERY SCHEDULE <span className="mx-2 opacity-60">|</span> Days from order to dispatch
        </div>

        <div className="overflow-x-auto">
          {/* Fits the page; scrolls only below the COLUMNS minimums added up (narrow screens). */}
          <div className="min-w-[760px] text-sm">
            <div className="bg-[var(--color-navy-700)] px-3 py-2 font-semibold text-white">
              Sourcing selection (<span className="text-[#FDE68A]">Yellow</span> = override) drives delivery time automatically
            </div>

            <div className="grid bg-[var(--color-blue)] text-xs font-semibold text-white" style={{ gridTemplateColumns: COLUMNS }}>
              {/* As in the workbook, "Notes" sits over the h/days column; "Model" over the note text. */}
              {['Process / Activity', 'Sourcing', 'Std. Days', 'Override Days', 'Unit', 'Notes', 'Model', ''].map((h, i) => (
                <div key={i} className={clsx('border-r border-white/20 px-2 py-2 last:border-r-0', i === 0 || i === 6 ? 'text-left' : 'text-center')}>
                  {h}
                </div>
              ))}
            </div>

            {phases.map((phase) => (
              <Fragment key={phase}>
                <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-teal-50)] px-3 py-1 text-sm font-bold text-[var(--color-ink)]">
                  <span className="py-0.5">— {phase} —</span>
                  {canEdit && (
                    <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => addRow(phase)}>
                      Add row
                    </Button>
                  )}
                </div>
                {rows
                  .filter((r) => r.phase === phase)
                  .map((r, i) => (
                    <div
                      key={r.key}
                      className={clsx('grid items-center border-b border-[var(--color-border)]', i % 2 === 1 && 'bg-[var(--color-surface)]')}
                      style={{ gridTemplateColumns: COLUMNS }}
                    >
                      <div className="min-w-0 px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          {r.isCustom && canEdit ? (
                            <input
                              value={r.label}
                              onChange={(e) => update(r.key, { label: e.target.value })}
                              placeholder="New activity name"
                              aria-label="Activity name"
                              className={clsx(cellInput, 'text-left', !r.label.trim() && 'border-[var(--color-red)]')}
                            />
                          ) : (
                            <span className="px-1">{r.label}</span>
                          )}
                          {r.isCustom && <span className="shrink-0 rounded-full bg-[var(--color-green-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-green)]">Added</span>}
                        </div>
                        {r.isCustom && <p className="px-1 text-[11px] text-[var(--color-ink-faint)]">{COUNT_NOTE[r.totalGroup]}</p>}
                      </div>
                      <div className="flex h-full items-center justify-center bg-[var(--color-amber-50)] px-1 py-1">
                        {canEdit ? (
                          <select value={r.sourcing} onChange={(e) => update(r.key, { sourcing: e.target.value as DeliverySourcing })} className={cellInput}>
                            {SOURCING_OPTIONS.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          r.sourcing
                        )}
                      </div>
                      <div className="flex h-full items-center justify-center px-1 py-1">
                        {canEdit ? (
                          <input type="number" min={0} step="any" value={r.std} onChange={(e) => update(r.key, { std: e.target.value })} aria-label={`${r.label} std. days`} className={cellInput} />
                        ) : (
                          r.std
                        )}
                      </div>
                      <div className="flex h-full items-center justify-center bg-[var(--color-amber-50)] px-1 py-1">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={r.override}
                            onChange={(e) => update(r.key, { override: e.target.value })}
                            aria-label={`${r.label} override days`}
                            title="Only used when the row is Outsourced"
                            className={cellInput}
                          />
                        ) : (
                          r.override
                        )}
                      </div>
                      <div
                        className="flex h-full items-center justify-center bg-[var(--color-blue-50)] font-semibold text-[var(--color-ink)]"
                        title="Outsource: Override Days if filled in, else Std. Days · In-house / Logistics: Std. Days · —: 0"
                      >
                        {fmtDays(days[r.key])} d
                      </div>
                      <div className="flex h-full items-center justify-center border-x border-[var(--color-border)] text-[var(--color-ink-faint)]">{r.unit}</div>
                      <div className="flex h-full min-w-0 items-center border-r border-[var(--color-border)] px-2 py-1 text-xs italic text-[var(--color-ink-soft)]">
                        {r.isCustom && canEdit ? (
                          <input
                            value={r.notes}
                            onChange={(e) => update(r.key, { notes: e.target.value })}
                            placeholder="Notes"
                            aria-label="Notes"
                            className={clsx(cellInput, 'text-left text-xs italic')}
                          />
                        ) : (
                          <span className="px-1 leading-snug">{r.notes}</span>
                        )}
                      </div>
                      <div className="flex justify-center">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => remove(r.key)}
                            aria-label={`Delete ${r.label || 'new row'}`}
                            title="Delete this row — its days come out of the total. Reset to Workbook Values brings workbook rows back."
                            className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-red-50)] hover:text-[var(--color-red)]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </Fragment>
            ))}
          </div>
        </div>

        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-stretch overflow-hidden rounded-md">
            <div className="flex flex-1 items-center bg-[var(--color-navy)] px-4 py-2.5 text-sm font-bold text-white sm:text-base">
              TOTAL CALENDAR DAYS (Parallel-path critical items)
            </div>
            <div className="flex w-28 items-center justify-center bg-[var(--color-orange)] text-lg font-bold text-white">{fmtDays(totalDays)} d</div>
            <div className="flex w-24 items-center justify-center border-l border-white/30 bg-[var(--color-orange)] text-xs text-white">calendar</div>
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
            <div className="flex w-52 items-center justify-center bg-[var(--color-green-50)] text-xl font-bold text-[var(--color-ink)]" title={`${weeks.toFixed(2)} weeks`}>
              {Math.round(weeks)} wks
            </div>
          </div>
          <p className="rounded-md bg-[var(--color-blue-50)] px-4 py-3 text-xs italic text-[var(--color-ink-soft)]">
            NOTE: Actual lead time is driven by the CRITICAL PATH (longest parallel chain). Typically: Bearing/Housing (98-120 days) or Shaft (84
            days) determines the schedule. Body manufacturing (81 days) usually runs in parallel. Change sourcing to 'Outsource' to activate
            outsourced lead times.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Reset Delivery Schedule"
        description="Put every Sourcing, Std. Days and Override Days value and the safety factor back to the client workbook's values (139 days, factor 1.2), and remove the rows you added? Your changes will be lost."
        confirmLabel="Reset"
        danger
      />
    </div>
  )
}
