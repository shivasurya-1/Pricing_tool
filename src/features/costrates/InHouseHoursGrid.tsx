import { useMemo, useState, type CSSProperties } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import clsx from 'clsx'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useReferenceStore } from '@/store/referenceStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { applyFieldChange, inHouseHoursVars } from '@/lib/pulleyTechDataCalc'
import { canRoleActOnStage } from '@/lib/workflow'
import type { PulleyTechDataValues, RFQ, RFQItem } from '@/types'

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
const head = 'border-b border-r border-[var(--color-border)] px-2 py-1.5'

// The rate columns stay put while the model columns scroll sideways (like Excel's
// Freeze Panes) — from md up; on a phone there'd be no room left for the models.
// `detail` columns can be hidden to leave more room for the models.
type FrozenKey = 'costHead' | 'operation' | 'costCentre' | 'activity' | 'rate'
const FROZEN: { key: FrozenKey; label: string; width: number; detail: boolean }[] = [
  { key: 'costHead', label: 'Cost Head', width: 120, detail: true },
  { key: 'operation', label: 'Operation', width: 110, detail: true },
  { key: 'costCentre', label: 'Cost Centre', width: 64, detail: true },
  { key: 'activity', label: 'Activity Description', width: 160, detail: false },
  { key: 'rate', label: 'MHR Rate', width: 64, detail: false },
]
const SHOW_DETAILS_KEY = 'in-house-hours:show-details'

function frozenCell(cols: typeof FROZEN, key: FrozenKey, background: string): { className: string; style: CSSProperties } {
  const index = cols.findIndex((c) => c.key === key)
  const left = cols.slice(0, index).reduce((sum, c) => sum + c.width, 0)
  const width = cols[index].width
  return {
    className: clsx(
      'z-10 md:sticky',
      background,
      // Separates the frozen block from the models scrolling under it.
      index === cols.length - 1 && 'md:shadow-[2px_0_0_0_var(--color-border)]',
    ),
    style: { left, width, minWidth: width, maxWidth: width },
  }
}

function readShowDetails(): boolean {
  try {
    return localStorage.getItem(SHOW_DETAILS_KEY) !== 'false'
  } catch {
    return true
  }
}

function autoOverrideKeys(item: RFQItem): Set<string> {
  return new Set(
    Object.entries(item.fieldOverrides ?? {})
      .filter(([, o]) => o.autoOverridden)
      .map(([key]) => key),
  )
}

interface Row {
  key: string
  costHead: string
  operation: string
  costCentre: string
  activity: string
  rate: number
  /** Section C operation (c1-c7) this row costs, or null for a reference-only rate row. */
  code: string | null
}

/**
 * One RFQ's in-house hours, laid out like the client workbook's In-House Hours sheet:
 * the MHR rate rows on the left, then a Run / Setup / Total / Cost group per pulley
 * ("Model 1, 2, 3 ..." in the workbook). Minutes are saved on each pulley (its c#RunMin /
 * c#SetupMin values); a blank cell uses that row's default minutes, shown grey. The
 * minutes and costs are the pulley's In-House Hours variables (inHouseHoursVars), which
 * Section C's formulas read (e.g. c1Cost = c1InHouseCost) on the Pricing Tool page.
 */
export function InHouseHoursGrid({ rfq }: { rfq: RFQ }) {
  const saveItemTechData = useDataStore((s) => s.saveItemTechData)
  const role = useAuthStore((s) => s.role)
  const pushToast = useUiStore((s) => s.pushToast)
  const inHouseHourRates = useReferenceStore((s) => s.inHouseHourRates)
  const editable = canRoleActOnStage(role, rfq.stage)

  const [showDetails, setShowDetails] = useState(readShowDetails)
  const frozenCols = FROZEN.filter((c) => showDetails || !c.detail)
  const toggleDetails = (next: boolean) => {
    setShowDetails(next)
    try {
      localStorage.setItem(SHOW_DETAILS_KEY, String(next))
    } catch {
      // Storage blocked — the choice just isn't remembered.
    }
  }

  // Unsaved edits, per pulley.
  const [drafts, setDrafts] = useState<Record<string, PulleyTechDataValues>>({})
  const [saving, setSaving] = useState(false)
  const valuesOf = (item: RFQItem) => drafts[item.id] ?? item.technicalData ?? {}
  const dirtyItems = rfq.items.filter((item) => drafts[item.id] !== undefined)

  const columns = useMemo(
    () => rfq.items.map((item) => ({ item, hours: inHouseHoursVars(drafts[item.id] ?? item.technicalData ?? {}) })),
    // inHouseHourRates: recompute when the rates/defaults change, though read via getState().
    [rfq.items, drafts, inHouseHourRates],
  )

  // Exactly the MHR Rates table's rows, in its order — deleting a row there removes it
  // here too (its Section C line is then costed at 0, like the workbook's IFNA(..., 0)).
  const rows: Row[] = useMemo(
    () =>
      [...inHouseHourRates]
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          key: `rate-${r.id}`,
          costHead: r.cost_head,
          operation: r.operation,
          costCentre: r.cost_centre,
          activity: r.activity_description,
          rate: r.mhr_rate,
          code: r.operation_code,
        })),
    [inHouseHourRates],
  )
  // The operations the grid shows, for its Total row.
  const shownCodes = rows.map((r) => r.code).filter((c): c is string => !!c)

  // "c1RunMin" -> the c1 row's default run minutes, as text ('' when the row is missing).
  const defaultOf = (key: string) => {
    const row = inHouseHourRates.find((r) => r.operation_code === key.slice(0, 2))
    if (!row) return ''
    return String(key.endsWith('RunMin') ? row.default_run_min : row.default_setup_min)
  }

  const setMinutes = (item: RFQItem, key: string, raw: string) => {
    const value = raw === '' ? '' : Number(raw)
    setDrafts((prev) => ({ ...prev, [item.id]: applyFieldChange(prev[item.id] ?? item.technicalData ?? {}, key, value, autoOverrideKeys(item)) }))
  }

  const save = async () => {
    setSaving(true)
    try {
      // Saves every model with an edit, storing exactly what was typed: a cell left empty
      // stays empty (and keeps showing the row's default in grey).
      for (const item of dirtyItems) await saveItemTechData(rfq.id, item.id, drafts[item.id])
      setDrafts({})
      pushToast(
        dirtyItems.length ? `In-house hours saved for ${dirtyItems.length} ${dirtyItems.length === 1 ? 'model' : 'models'}.` : 'Nothing to save — no minutes were changed.',
        'success',
      )
    } catch {
      // withErrorToast already showed the error; keep the unsaved edits.
    } finally {
      setSaving(false)
    }
  }

  if (rfq.items.length === 0) return <p className="text-sm text-[var(--color-ink-soft)]">This RFQ has no pulleys yet.</p>

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ink-soft)]">
          Run and setup minutes per model (pulley). Cost = MHR rate × (Run + Setup), as in the In-House Hours sheet.
          <span className="ml-1 italic text-[var(--color-ink-faint)]">Grey = the row's default minutes.</span>
          {!editable && <span className="text-[var(--color-ink-faint)]"> Only the {rfq.stage} owner can change these minutes.</span>}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
            <input type="checkbox" checked={showDetails} onChange={(e) => toggleDetails(e.target.checked)} />
            Show Cost Head / Operation / Cost Centre
          </label>
          {editable && (
            <div className="flex gap-1.5">
              {dirtyItems.length > 0 && (
                <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => setDrafts({})} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={save} disabled={saving}>
                Save all models
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="bg-[var(--color-surface-alt)] text-xs font-semibold text-[var(--color-ink-soft)]">
              {frozenCols.map((c) => {
                const f = frozenCell(frozenCols, c.key, 'bg-[var(--color-surface-alt)]')
                return (
                  <th key={c.key} rowSpan={2} className={clsx(head, f.className, c.key === 'rate' ? 'text-right' : 'text-left')} style={f.style}>
                    {c.label}
                    {c.key === 'rate' && <span className="block font-normal text-[var(--color-ink-faint)]">(INR/hr)</span>}
                  </th>
                )
              })}
              {columns.map(({ item }) => {
                // The pulley as it was added to the RFQ (its product name), plus its tag if set.
                const tag = item.technicalData?.pulleyTagName ?? item.technicalData?.pulleyTag
                return (
                  <th key={item.id} colSpan={4} className={clsx(head, 'bg-[var(--color-blue-50)] text-center text-[var(--color-blue)]')}>
                    {item.productName || `Pulley ${item.itemNo}`}
                    {tag ? <span className="block font-normal text-[var(--color-ink-faint)]">{String(tag)}</span> : null}
                  </th>
                )
              })}
            </tr>
            <tr className="bg-[var(--color-surface-alt)] text-[11px] text-[var(--color-ink-faint)]">
              {columns.map(({ item }) => (
                <SubHeads key={item.id} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[var(--color-border)]">
                {frozenCols.map((c) => {
                  const f = frozenCell(frozenCols, c.key, 'bg-white')
                  const text = c.key === 'rate' ? row.rate.toFixed(1) : row[c.key]
                  return (
                    <td
                      key={c.key}
                      className={clsx(
                        'border-r border-[var(--color-border)] px-2 py-1.5 text-xs',
                        f.className,
                        c.key === 'activity' && 'font-medium',
                        c.key === 'rate' && 'text-right tabular-nums',
                      )}
                      style={f.style}
                    >
                      {text}
                    </td>
                  )
                })}
                {columns.map(({ item, hours }) => {
                  if (!row.code) return <BlankGroup key={item.id} />
                  const values = valuesOf(item)
                  const runKey = `${row.code}RunMin`
                  const setupKey = `${row.code}SetupMin`
                  return (
                    <MinutesGroup
                      key={item.id}
                      run={values[runKey]}
                      setup={values[setupKey]}
                      runDefault={defaultOf(runKey)}
                      setupDefault={defaultOf(setupKey)}
                      total={hours.vars[`${row.code}TotalMin`]}
                      cost={hours.vars[`${row.code}InHouseCost`]}
                      editable={editable}
                      onRun={(v) => setMinutes(item, runKey, v)}
                      onSetup={(v) => setMinutes(item, setupKey, v)}
                    />
                  )
                })}
              </tr>
            ))}
            <tr className="bg-[var(--color-surface-alt)] font-semibold">
              {frozenCols.map((c) => {
                const f = frozenCell(frozenCols, c.key, 'bg-[var(--color-surface-alt)]')
                return (
                  <td key={c.key} className={clsx('border-r border-[var(--color-border)] px-2 py-2', f.className)} style={f.style}>
                    {c.key === 'activity' ? 'Total' : ''}
                  </td>
                )
              })}
              {columns.map(({ item, hours }) => {
                const sum = (suffix: string) => shownCodes.reduce((s, code) => s + hours.vars[`${code}${suffix}`], 0)
                return <TotalsGroup key={item.id} run={sum('RunMin')} setup={sum('SetupMin')} cost={sum('InHouseCost')} />
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubHeads() {
  return (
    <>
      <th className="border-b border-[var(--color-border)] px-2 py-1 text-right font-medium">Run (min)</th>
      <th className="border-b border-[var(--color-border)] px-2 py-1 text-right font-medium">Setup (min)</th>
      <th className="border-b border-[var(--color-border)] px-2 py-1 text-right font-medium">Total (min)</th>
      <th className="border-b border-r border-[var(--color-border)] px-2 py-1 text-right font-medium">Cost (INR)</th>
    </>
  )
}

function BlankGroup() {
  return (
    <>
      <td className="px-2 py-1 text-center text-[var(--color-ink-faint)]">—</td>
      <td className="px-2 py-1 text-center text-[var(--color-ink-faint)]">—</td>
      <td className="px-2 py-1 text-center text-[var(--color-ink-faint)]">—</td>
      <td className="border-r border-[var(--color-border)] px-2 py-1 text-center text-[var(--color-ink-faint)]">—</td>
    </>
  )
}

function MinutesGroup({
  run,
  setup,
  runDefault,
  setupDefault,
  total,
  cost,
  editable,
  onRun,
  onSetup,
}: {
  run: string | number | undefined
  setup: string | number | undefined
  runDefault: string
  setupDefault: string
  total: number
  cost: number
  editable: boolean
  onRun: (v: string) => void
  onSetup: (v: string) => void
}) {
  return (
    <>
      <td className="px-1 py-1">
        <MinutesInput value={run} fallback={runDefault} editable={editable} onChange={onRun} />
      </td>
      <td className="px-1 py-1">
        <MinutesInput value={setup} fallback={setupDefault} editable={editable} onChange={onSetup} />
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-[var(--color-ink-soft)]">{fmt(total)}</td>
      <td className="border-r border-[var(--color-border)] px-2 py-1 text-right tabular-nums">{fmt(cost)}</td>
    </>
  )
}

function TotalsGroup({ run, setup, cost }: { run: number; setup: number; cost: number }) {
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums">{fmt(run)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{fmt(setup)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{fmt(run + setup)}</td>
      <td className="border-r border-[var(--color-border)] px-2 py-2 text-right tabular-nums">{fmt(cost)}</td>
    </>
  )
}

/** Blank shows the default (grey placeholder) and is what's used in the calculation;
 * a typed number is this pulley's own value (normal text), clearing the cell goes back
 * to the default. */
function MinutesInput({
  value,
  fallback,
  editable,
  onChange,
}: {
  value: string | number | undefined
  fallback: string
  editable: boolean
  onChange: (v: string) => void
}) {
  const shown = value === undefined || value === null ? '' : String(value)
  if (!editable) {
    return (
      <span className={clsx('block px-1 text-right tabular-nums', shown === '' && 'italic text-[var(--color-ink-faint)]')}>
        {shown === '' ? fallback || '—' : shown}
      </span>
    )
  }
  return (
    <input
      type="number"
      min={0}
      value={shown}
      placeholder={fallback}
      title={shown === '' && fallback !== '' ? 'Default minutes for this row — type to set this model\'s own value' : undefined}
      onChange={(e) => onChange(e.target.value)}
      // A scroll over a focused number box would otherwise change its value unnoticed.
      onWheel={(e) => e.currentTarget.blur()}
      className="w-16 rounded border border-[var(--color-border)] px-1.5 py-1 text-right text-sm tabular-nums text-[var(--color-ink)] outline-none placeholder:italic placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-blue)]"
    />
  )
}
