/**
 * Sourcing-entered OUTSOURCED process costs (per unit, INR) and how they feed
 * "Outsourced processing cost (D)".
 *
 * Stored per RFQ item by the backend (rfq/sourcing_costs.py):
 *  - processCosts:    a manual cost for one of PROCESS_SOURCING_MAP's processes — only
 *                     counts while that process is set to "Outsource".
 *  - customProcesses: extra outsourced processes added on the Sourcing screen.
 *
 * Section D is calculated in two places, so both are adjusted from here:
 *  1. computePulleyPricing() (Sourcing / Controlling / dashboards) -> applyOutsourcedCostsToSectionD()
 *  2. The Pricing Tool page's "Pricing Section D" Formulas-page fields (d1…d8 + the D total,
 *     which feed Section F's totals and prices) -> outsourcedAutoFieldAdjust(), passed to
 *     computeAutoFields().
 */

import type { CustomProcess, ProcessCostOverride, PulleyTechDataValues, RFQItem } from '@/types'
import { PROCESS_SOURCING_MAP } from '@/data/pulleyTechDataSchema'
import { useFormulaStore } from '@/store/formulaStore'

export interface SourcingCosts {
  processCosts?: ProcessCostOverride[]
  customProcesses?: CustomProcess[]
}

/** Values computeAutoFields() forces onto Auto fields: `pinned` replaces a field's
 * formula result, `add` is added on top of it. Dependent fields see the adjusted value. */
export interface AutoFieldAdjust {
  pinned: Record<string, number>
  add: Record<string, number>
}

/** Same shape as pulleyPricingCalc's CostLine (kept local to avoid an import cycle). */
interface Line {
  key: string
  label: string
  value: number
  pending?: boolean
}

export function sourcingCostsOf(item: Pick<RFQItem, 'processCosts' | 'customProcesses'> | undefined): SourcingCosts {
  return { processCosts: item?.processCosts, customProcesses: item?.customProcesses }
}

/** The manual cost for a process, or undefined if none is set / it isn't outsourced. */
export function manualOutsourcedCost(values: PulleyTechDataValues, sourcing: SourcingCosts | undefined, srcKey: string): number | undefined {
  if (values[srcKey] !== 'Outsource') return undefined
  const cost = sourcing?.processCosts?.find((p) => p.processKey === srcKey)?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}

/** Section D line key used for an outsourced process that has no built-in D line (Welding). */
export const extraLineKey = (srcKey: string) => `d-${srcKey}`
export const customLineKey = (id: string) => `d-custom-${id}`

/** Manual costs split into: those replacing an existing Section D line (by dKey), and
 * extra lines (processes with no dKey + every custom process). */
function outsourcedAdjustments(values: PulleyTechDataValues, sourcing: SourcingCosts | undefined) {
  const replace = new Map<string, number>()
  const extra: Line[] = []
  for (const p of PROCESS_SOURCING_MAP) {
    const cost = manualOutsourcedCost(values, sourcing, p.srcKey)
    if (cost === undefined) continue
    if (p.dKey) replace.set(p.dKey, cost)
    else extra.push({ key: extraLineKey(p.srcKey), label: `${p.label} (Outsourced)`, value: cost })
  }
  for (const c of sourcing?.customProcesses ?? []) {
    extra.push({ key: customLineKey(c.id), label: `${c.label} (Outsourced)`, value: Number(c.cost) || 0 })
  }
  return { replace, extra }
}

/** Section D lines with manual costs applied and extra outsourced lines appended. */
export function applyOutsourcedCostsToSectionD<T extends Line>(sectionD: T[], values: PulleyTechDataValues, sourcing: SourcingCosts | undefined): T[] {
  const { replace, extra } = outsourcedAdjustments(values, sourcing)
  if (replace.size === 0 && extra.length === 0) return sectionD
  const lines = sectionD.map((l) => (replace.has(l.key) ? { ...l, value: replace.get(l.key)!, pending: false } : l))
  // A manual cost whose dKey has no line on this sheet still has to count.
  for (const [dKey, value] of replace) {
    if (!lines.some((l) => l.key === dKey)) {
      const p = PROCESS_SOURCING_MAP.find((x) => x.dKey === dKey)!
      lines.push({ key: dKey, label: `${p.label} (Outsourced)`, value } as T)
    }
  }
  return [...lines, ...(extra as T[])]
}

/** Extra Section D lines (no built-in D line / custom processes) — the Pricing Tool page
 * shows these as additional rows in its Section D block. */
export function extraOutsourcedLines(values: PulleyTechDataValues, sourcing: SourcingCosts | undefined): Line[] {
  const { replace, extra } = outsourcedAdjustments(values, sourcing)
  const unmatched = [...replace].filter(([dKey]) => !findSectionDField(dKey))
  return [
    ...unmatched.map(([dKey, value]) => ({ key: dKey, label: `${PROCESS_SOURCING_MAP.find((x) => x.dKey === dKey)!.label} (Outsourced)`, value })),
    ...extra,
  ]
}

const SECTION_D_RE = /^\s*Pricing Section D\b/i

function sectionDFields() {
  return Object.values(useFormulaStore.getState().techDataFields).filter((f) => SECTION_D_RE.test(f.section))
}

/** The Formulas page's Section D field for a built-in line, e.g. d2 -> d2StressReliefAnnealing
 * (by key prefix, else by a "D2." label). */
function findSectionDField(dKey: string) {
  const keyRe = new RegExp(`^${dKey}(?![0-9])`, 'i')
  const labelRe = new RegExp(`^\\s*${dKey}\\s*\\.`, 'i')
  const fields = sectionDFields()
  return fields.find((f) => keyRe.test(f.key)) ?? fields.find((f) => labelRe.test(f.label))
}

/** The Formulas page's "TOTAL OUTSOURCED PROCESSING COST (D)" field. */
function findSectionDTotalField() {
  return sectionDFields().find((f) => /^\s*total\b/i.test(f.label))
}

/** computeAutoFields() adjustment so the Pricing Tool page's Section D fields, its D total
 * and everything computed from it (Section F totals, prices) include the manual costs. */
export function outsourcedAutoFieldAdjust(values: PulleyTechDataValues, sourcing: SourcingCosts | undefined): AutoFieldAdjust | undefined {
  const { replace } = outsourcedAdjustments(values, sourcing)
  const extras = extraOutsourcedLines(values, sourcing)
  if (replace.size === 0 && extras.length === 0) return undefined
  const pinned: Record<string, number> = {}
  for (const [dKey, cost] of replace) {
    const field = findSectionDField(dKey)
    if (field) pinned[field.key] = cost
  }
  const add: Record<string, number> = {}
  const total = findSectionDTotalField()
  const extraSum = extras.reduce((s, l) => s + l.value, 0)
  if (total && extraSum) add[total.key] = extraSum
  return { pinned, add }
}
