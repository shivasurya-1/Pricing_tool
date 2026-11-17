/**
 * Sourcing-screen rows built from the Formulas page's "Pricing Section C — In-House
 * Processing" and "Pricing Section D — Outsourced Processing" fields, plus rows added on
 * the Sourcing screen, and how they feed the Pricing Tool page.
 *
 * Stored per RFQ item (backend rfq/sourcing_costs.py):
 *  - outsourcedFieldCosts {fieldKey: cost}  — replaces that C/D field's formula value
 *  - outsourcedFieldModes {fieldKey: mode}  — only when not the field's own section's mode
 *                                             (C fields default In-house, D fields Outsource)
 *  - customProcesses [{id, label, mode, cost, vendor…}] — rows added for this pulley only
 *
 * On the Pricing Tool page a row's cost lands in the section of its mode:
 *   In-house -> C,  Outsource -> D,  Logistics -> E.
 * A field switched away from its own section shows 0 there and its cost appears as an
 * extra line in the other section. Extra lines are added into that section's TOTAL field,
 * so Section F (Total Direct Cost, prices) follows.
 */

import type { PulleyTechDataValues, RFQItem, SourcingMode } from '@/types'
import { useFormulaStore, type TechDataFieldDto } from '@/store/formulaStore'
import { computeAutoFields } from '@/lib/pulleyTechDataCalc'

/** Values computeAutoFields() forces onto Auto fields: `pinned` replaces a field's formula
 * result, `add` is added on top of it. Fields depending on them see the adjusted value. */
export interface AutoFieldAdjust {
  pinned: Record<string, number>
  add?: Record<string, number>
}

export type CostSection = 'C' | 'D' | 'E'
export const SECTION_OF_MODE: Record<SourcingMode, CostSection> = { 'In-house': 'C', Outsource: 'D', Logistics: 'E' }

/** A cost line shown in a section it doesn't come from (moved D field / added row). */
export interface ExtraLine {
  key: string
  label: string
  value: number
}

const TOTAL_RE = /^\s*total\b/i
export const isTotalField = (f: Pick<TechDataFieldDto, 'label'>) => TOTAL_RE.test(f.label)

/** The Formulas page's "Pricing Section <letter>" fields (totals included), in page order. */
export function pricingSectionFields(
  letter: string,
  techDataFields: Record<string, TechDataFieldDto> = useFormulaStore.getState().techDataFields,
): TechDataFieldDto[] {
  const re = new RegExp(`^\\s*Pricing Section ${letter}\\b`, 'i')
  return Object.values(techDataFields)
    .filter((f) => f.sheet === 'pricing_tool' && re.test(f.section))
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
}

export const sectionDFields = (techDataFields?: Record<string, TechDataFieldDto>) => pricingSectionFields('D', techDataFields)

/** A field's own section's mode — what it has when nothing is stored for it. */
export const HOME_MODE: Record<'C' | 'D', SourcingMode> = { C: 'In-house', D: 'Outsource' }

/** Rows the Sourcing screen lists from the Formulas page: Pricing Section C fields (default
 * In-house) then Pricing Section D fields (default Outsource), total rows excluded. */
export function sourcingFields(techDataFields?: Record<string, TechDataFieldDto>): { field: TechDataFieldDto; home: 'C' | 'D' }[] {
  return (['C', 'D'] as const).flatMap((home) =>
    pricingSectionFields(home, techDataFields)
      .filter((f) => !isTotalField(f))
      .map((field) => ({ field, home })),
  )
}
/** A Section D field's value for one pulley — same resolution as the Pricing Tool page:
 * Auto field -> computed value, else the saved value, else the field's fixed value. */
export function sectionDFieldValue(f: TechDataFieldDto, values: PulleyTechDataValues, autoValues: PulleyTechDataValues): number | undefined {
  const raw = f.is_auto ? (autoValues[f.key] ?? values[f.key]) : values[f.key]
  const v = raw !== undefined && raw !== null && raw !== '' ? raw : f.fixed_value || undefined
  if (v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

const finiteCosts = (costs: Record<string, number> | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(costs ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))

const plainLabel = (label: string) => label.replace(/\s*\(\s*outsourced[^)]*\)\s*$/i, '').trim()

export interface SourcingResult {
  /** Item values with Sourcing costs / moved fields applied — use as the column's values. */
  values: PulleyTechDataValues
  /** Auto field values with everything applied — use as the column's autoValues. */
  autoValues: PulleyTechDataValues
  /** Each D field's own cost (manual or formula), whatever its mode — for the Sourcing table. */
  rowCost: Record<string, number | undefined>
  /** Lines to show in each section above its total, beyond that section's own fields. */
  extraLines: Record<CostSection, ExtraLine[]>
}

/** Applies the item's Sourcing rows (costs, modes, added rows) to its Pricing Tool values. */
type SourcingItem = Pick<RFQItem, 'outsourcedFieldCosts' | 'outsourcedFieldModes' | 'outsourcedFieldMeta' | 'customProcesses'>

/** A C / D row's name on this pulley: its Sourcing-screen rename, else the Formulas page label. */
export const fieldLabelFor = (item: Pick<RFQItem, 'outsourcedFieldMeta'> | undefined, f: Pick<TechDataFieldDto, 'key' | 'label'>) =>
  item?.outsourcedFieldMeta?.[f.key]?.label || f.label

/** True when the row was removed from this pulley on the Sourcing screen. */
export const isFieldHidden = (item: Pick<RFQItem, 'outsourcedFieldMeta'> | undefined, key: string) => !!item?.outsourcedFieldMeta?.[key]?.hidden

export interface PulleyCostSummary {
  /** Section C / D totals x qty — what the Pricing Tool page shows, Sourcing changes included. */
  inHouse: number
  outsourced: number
  totalDirectCost: number
  perUnit: number
  qty: number
}

/** One pulley's cost summary from the Formulas page's own totals (Pricing Section C / D TOTAL
 * fields and Section F's TOTAL DIRECT COST), with Sourcing changes applied — the same numbers
 * as the Pricing Tool page. null when those fields aren't loaded (caller falls back). */
export function formulaCostSummary(item: SourcingItem & Pick<RFQItem, 'technicalData'>): PulleyCostSummary | null {
  const s = computeWithSourcing(item.technicalData ?? {}, item)
  const valueOf = (f: TechDataFieldDto | undefined) => (f ? sectionDFieldValue(f, s.values, s.autoValues) : undefined)
  const totalC = valueOf(pricingSectionFields('C').find(isTotalField))
  const totalD = valueOf(pricingSectionFields('D').find(isTotalField))
  const tdc = valueOf(pricingSectionFields('F').find((f) => /total direct cost/i.test(f.label)))
  if (totalC === undefined || totalD === undefined || tdc === undefined) return null
  const qty = Number(s.values.numberOfPulleysQty) || Number(s.values.qty) || 1
  return { inHouse: totalC * qty, outsourced: totalD * qty, totalDirectCost: tdc, perUnit: tdc / qty, qty }
}

export function computeWithSourcing(
  rawValues: PulleyTechDataValues,
  item: SourcingItem | undefined,
): SourcingResult {
  const costs = finiteCosts(item?.outsourcedFieldCosts)
  const modes = item?.outsourcedFieldModes ?? {}
  const values: PulleyTechDataValues = { ...rawValues, ...costs }
  const pinned: Record<string, number> = { ...costs }

  // Pass 1 — each C / D field's own cost (manual costs applied).
  let autoValues = computeAutoFields(values, Object.keys(pinned).length ? { pinned } : undefined)
  const fields = sourcingFields()
  const rowCost: Record<string, number | undefined> = {}
  for (const { field } of fields) rowCost[field.key] = sectionDFieldValue(field, values, autoValues)

  const extraLines: Record<CostSection, ExtraLine[]> = { C: [], D: [], E: [] }
  let zeroed = false
  for (const { field: f, home } of fields) {
    if (isFieldHidden(item, f.key)) {
      // Removed from this pulley on the Sourcing screen — its cost no longer counts.
      pinned[f.key] = 0
      values[f.key] = 0
      zeroed = true
      continue
    }
    const mode = modes[f.key] ?? HOME_MODE[home]
    if (SECTION_OF_MODE[mode] === home) continue
    // No mode suffix — the section it's listed in already says In-house / Outsourced / Logistics.
    extraLines[SECTION_OF_MODE[mode]].push({ key: f.key, label: plainLabel(fieldLabelFor(item, f)), value: rowCost[f.key] ?? 0 })
    pinned[f.key] = 0 // leaves its own section
    values[f.key] = 0
    zeroed = true
  }
  for (const c of item?.customProcesses ?? []) {
    const mode = c.mode ?? 'Outsource'
    extraLines[SECTION_OF_MODE[mode]].push({ key: `custom-${c.id}`, label: c.label, value: Number(c.cost) || 0 })
  }

  const add: Record<string, number> = {}
  for (const letter of ['C', 'D', 'E'] as const) {
    const sum = extraLines[letter].reduce((s, l) => s + l.value, 0)
    const total = sum ? pricingSectionFields(letter).find(isTotalField) : undefined
    if (total) add[total.key] = (add[total.key] ?? 0) + sum
  }

  // Pass 2 — only when something moved or was added.
  if (zeroed || Object.keys(add).length) autoValues = computeAutoFields(values, { pinned, add })

  return { values, autoValues, rowCost, extraLines }
}
