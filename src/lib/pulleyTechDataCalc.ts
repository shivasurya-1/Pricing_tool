/**
 * Live replicas of the geometry/weight formulas found in the client's
 * "Pricing Tool" sheet (per-model columns). Only the auto-calculated
 * TECH DATA SHEET fields are covered here — cost/pricing formulas
 * (Sections A-F) are a separate, later step.
 *
 * Two calculation paths:
 *  - computeAutoFieldsDynamic: evaluates the current formula definitions fetched
 *    from the backend (editable on the Formulas page) via the safe evaluateFormula().
 *  - computeAutoFieldsStatic: the original hardcoded math, used whenever the backend
 *    isn't reachable (not running locally, or not deployed yet) — see formulaStore.
 * Both must agree exactly on seeded/default data; see backend/formulas/tests.py and
 * the frontend regression walkthrough for the checks that keep them in sync.
 */

import type { PulleyTechDataValues } from '@/types'
import { PRICE_FIELD_SOURCE, lookupCatalogPrice, IN_HOUSE_OPERATIONS } from '@/data/pulleyTechDataSchema'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'
import { useFormulaStore } from '@/store/formulaStore'
import { evaluateFormula } from '@/lib/formulaEval'

export type PulleyModelValues = PulleyTechDataValues

const num = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Exported so the Formulas page's preview feature can build the same variable bag
 * from a real sample item as computeAutoFieldsDynamic does. */
export function toNumericVars(values: PulleyTechDataValues): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

function computeAutoFieldsDynamic(values: PulleyTechDataValues): PulleyTechDataValues {
  const { formulas, costRates } = useFormulaStore.getState()
  const vars = toNumericVars(values)
  const out: PulleyTechDataValues = {}

  const evalKey = (key: string) => {
    const f = formulas[key]
    if (!f) throw new Error(`Formula not loaded: ${key}`)
    const result = evaluateFormula(f.expression, vars)
    vars[key] = result
    out[key] = round2(result)
  }

  evalKey('sheetLength')
  evalKey('shellPlateWeight')
  evalKey('hubMass')
  evalKey('shaftMass')
  evalKey('laggingArea')
  evalKey('laggingCost')
  evalKey('totalBearingsHousings')

  for (const op of IN_HOUSE_OPERATIONS) {
    evalKey(`${op.key}TotalHours`)
    vars[`${op.key}RateInrPerHour`] = costRates[op.rateKey] ?? PULLEY_COST_RATES.labourRatesInrPerHour[op.rateKey]
    evalKey(`${op.key}Cost`)
  }

  return out
}

function computeAutoFieldsStatic(values: PulleyTechDataValues): PulleyTechDataValues {
  const shellOD = num(values.shellOD)
  const shellFaceWidth = num(values.shellFaceWidth)
  const shellRawThickness = num(values.shellRawThickness)
  const sheetWidth = num(values.sheetWidth) || shellFaceWidth
  const hubMinOD = num(values.hubMinOD)
  const hubID = num(values.hubID)
  const hubWidth = num(values.hubWidth)
  const shaftDiameter = num(values.shaftDiameter)
  const shaftLength = num(values.shaftLength)

  // Sheet development length = (OD + 10 - thickness) x pi + 100mm trim allowance
  const sheetLength = shellOD > 0 ? (shellOD + 10 - shellRawThickness) * Math.PI + 100 : 0

  // Shell plate weight (kg) = thickness(mm) x width(m) x length(m) x 7.85
  const shellPlateWeight = shellRawThickness * (sheetWidth / 1000) * (sheetLength / 1000) * 7.85

  // Hub mass, 2 hubs (kg) = 2 x pi/4 x (OD^2 - ID^2)(m) x width(m) x 7850
  const hubMass = hubMinOD > 0 ? 2 * (Math.PI / 4) * ((hubMinOD / 1000) ** 2 - (hubID / 1000) ** 2) * (hubWidth / 1000) * 7850 : 0

  // Shaft mass (kg) = pi/4 x dia^2(m) x length(m) x 7850
  const shaftMass = shaftDiameter > 0 ? (Math.PI / 4) * (shaftDiameter / 1000) ** 2 * (shaftLength / 1000) * 7850 : 0

  // Lagging area (m^2) = pi x OD(m) x face width(m)
  const laggingArea = shellOD > 0 ? Math.PI * (shellOD / 1000) * (shellFaceWidth / 1000) : 0

  const laggingRate = num(values.laggingRate)
  const laggingCost = laggingArea * laggingRate

  const bearing1Price = num(values.bearing1Price)
  const bearing2Price = num(values.bearing2Price)
  const sleevePrice = num(values.sleevePrice)
  const housingPrice = num(values.housingPrice)
  const totalBearingsHousings = 2 * (bearing1Price + bearing2Price + sleevePrice + housingPrice)

  const hoursFields: PulleyTechDataValues = {}
  for (const op of IN_HOUSE_OPERATIONS) {
    const runMin = num(values[`${op.key}RunMin`])
    const setupMin = num(values[`${op.key}SetupMin`])
    const totalHours = (runMin + setupMin) / 60
    const rate = PULLEY_COST_RATES.labourRatesInrPerHour[op.rateKey]
    hoursFields[`${op.key}TotalHours`] = round2(totalHours)
    hoursFields[`${op.key}Cost`] = round2(totalHours * rate)
  }

  return {
    sheetLength: round2(sheetLength),
    shellPlateWeight: round2(shellPlateWeight),
    hubMass: round2(hubMass),
    shaftMass: round2(shaftMass),
    laggingArea: round2(laggingArea),
    laggingCost: round2(laggingCost),
    totalBearingsHousings: round2(totalBearingsHousings),
    ...hoursFields,
  }
}

export function computeAutoFields(values: PulleyTechDataValues): PulleyTechDataValues {
  if (useFormulaStore.getState().loaded) {
    try {
      return computeAutoFieldsDynamic(values)
    } catch (err) {
      console.warn('[computeAutoFields] dynamic formula evaluation failed, using static calculation:', err)
    }
  }
  return computeAutoFieldsStatic(values)
}

/** Applies one field edit, then re-runs catalog price lookups and geometry auto-calcs. Shared by every screen that edits a pulley's technical data. */
export function applyFieldChange(values: PulleyTechDataValues, fieldKey: string, rawValue: string | number): PulleyTechDataValues {
  let next: PulleyTechDataValues = { ...values, [fieldKey]: rawValue }

  for (const [priceKey, sourceKey] of Object.entries(PRICE_FIELD_SOURCE)) {
    if (fieldKey === sourceKey) {
      const looked = lookupCatalogPrice(priceKey, String(rawValue))
      if (looked !== null) next[priceKey] = looked
    }
  }

  next = { ...next, ...computeAutoFields(next) }
  return next
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
