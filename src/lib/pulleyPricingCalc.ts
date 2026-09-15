/**
 * Replicates the "Pricing Tool" sheet's Section A-F cost buildup, reading
 * from a single RFQ item's captured Technical Data Sheet values.
 *
 * Section C (In-House Processing) is costed from the "9. In-House Processing
 * Hours" section — Run + Setup minutes per operation x that operation's MHR
 * rate (from Cost Rate Tables / labourRatesInrPerHour), rather than the
 * source workbook's separate In-House Hours + MHR & LHR Calculator tabs.
 * A line is only marked `pending` if no hours have been entered yet.
 *
 * Two calculation paths, same as pulleyTechDataCalc.ts: computePulleyPricingDynamic
 * evaluates the current (editable, backend-fetched) formula definitions; the
 * "Static" version below is the original hardcoded fallback used whenever the
 * backend isn't reachable. See formulaStore for how `loaded` is determined.
 */

import type { PulleyTechDataValues } from '@/types'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'
import { IN_HOUSE_OPERATIONS } from '@/data/pulleyTechDataSchema'
import { useFormulaStore } from '@/store/formulaStore'
import { evaluateFormula } from '@/lib/formulaEval'

const num = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v) || 0)

export interface CostLine {
  key: string
  label: string
  value: number
  pending?: boolean
}

export interface PulleyPricingResult {
  sectionA: CostLine[]
  sectionB: CostLine[]
  sectionC: CostLine[]
  sectionD: CostLine[]
  sectionE: CostLine[]
  totalA: number
  totalB: number
  totalC: number
  totalD: number
  totalE: number
  totalDirectCostPerUnit: number
  totalDirectCost: number // x qty
  listPrice: number
  netOemPrice: number
  priceInclGst: number
  netPriceEur: number
  grossMarginPercent: number
  itemTotal: number
  qty: number
}

/** Builds the full variable bag Section A-F formulas evaluate against — exported so
 * the Formulas page's preview feature can show a real sample's numbers, not just an
 * empty form. */
export function buildPricingVariables(values: PulleyTechDataValues, costRates: Record<string, number>): Record<string, number> {
  const r = PULLEY_COST_RATES
  const qty = num(values.qty) || 1
  const shaftMaterial = String(values.shaftMaterial ?? '')
  return {
    ...toNumericVars(values),
    qty,
    shellRatePerKg: num(values.shellRatePerKg) || r.rawForgingRates.shellPlateInrPerKg,
    endDiscRatePerKg: num(values.endDiskRatePerKg) || r.rawForgingRates.endDiscInrPerKg,
    shaftMaterialRateInrPerKg: shaftMaterial === '42CrMo4+QT' ? r.rawForgingRates.shaft42CrMo4InrPerKg : r.rawForgingRates.shaftC45InrPerKg,
    weldConsumablesInrPerKgPulley: costRates.weldConsumablesInrPerKgPulley ?? r.weldConsumablesInrPerKgPulley,
    greaseInrPerKgPulley: costRates.greaseInrPerKgPulley ?? r.greaseInrPerKgPulley,
    stressReliefInrPerKg: costRates.stressReliefInrPerKg ?? r.stressReliefInrPerKg,
    paintingSurfacePrepInrPerM2: costRates.paintingSurfacePrep ?? r.labourRatesInrPerHour.paintingSurfacePrep,
    balancingInrPerSet: costRates.balancingInrPerSet ?? r.balancingInrPerSet,
    machiningOutsourcedInrPerKg: costRates.machiningOutsourcedInrPerKg ?? r.machiningOutsourcedInrPerKg,
    packingWoodCratePer100kg: costRates.packingWoodCratePer100kg ?? r.logistics.packingWoodCratePer100kg,
    inboundFreightShaftPerKg: costRates.inboundFreightShaftPerKg ?? r.logistics.inboundFreightShaftPerKg,
    inboundFreightPlatesPerKg: costRates.inboundFreightPlatesPerKg ?? r.logistics.inboundFreightPlatesPerKg,
    inboundFreightPurchasedPartsPerOrder: costRates.inboundFreightPurchasedPartsPerOrder ?? r.logistics.inboundFreightPurchasedPartsPerOrder,
    outboundShippingFobPerKg: costRates.outboundShippingFobPerKg ?? r.logistics.outboundShippingFobPerKg,
    priceFactorMarkup: costRates.priceFactorMarkup ?? r.priceFactorMarkup,
    oemDiscount: costRates.oemDiscount ?? r.oemDiscount,
    gstRate: costRates.gstRate ?? r.gstRate,
    exchangeRateEurToInr: costRates.exchangeRateEurToInr ?? r.exchangeRateEurToInr,
    srcRollingBendingIsOutsource: values.srcRollingBending === 'Outsource' ? 1 : 0,
    srcStressReliefIsOutsource: values.srcStressRelief === 'Outsource' ? 1 : 0,
    srcPaintingIsOutsource: values.srcPainting === 'Outsource' ? 1 : 0,
    srcLaggingIsOutsource: values.srcLagging === 'Outsource' ? 1 : 0,
    srcBalancingIsOutsource: values.srcBalancing === 'Outsource' ? 1 : 0,
  }
}

function toNumericVars(values: PulleyTechDataValues): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

const SECTION_A_KEYS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']
const SECTION_B_KEYS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']
const SECTION_D_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8']
const SECTION_E_KEYS = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']
const SECTION_F_KEYS = ['totalDirectCostPerUnit', 'totalDirectCost', 'listPrice', 'netOemPrice', 'priceInclGst', 'netPriceEur', 'grossMarginPercent', 'itemTotal']

function computePulleyPricingDynamic(values: PulleyTechDataValues): PulleyPricingResult {
  const { formulas, costRates } = useFormulaStore.getState()
  const qty = num(values.qty) || 1
  const vars = buildPricingVariables(values, costRates)

  const evalLine = (sectionPrefix: string, shortKey: string): CostLine => {
    const fullKey = `${sectionPrefix}.${shortKey}`
    const f = formulas[fullKey]
    if (!f) throw new Error(`Formula not loaded: ${fullKey}`)
    const value = evaluateFormula(f.expression, vars)
    const pending =
      f.expression === '0' ||
      (shortKey === 'b6' && value === 0) ||
      (sectionPrefix === 'sectionC' && vars[`${shortKey}RunMin`] === 0 && vars[`${shortKey}SetupMin`] === 0)
    return { key: shortKey, label: f.label, value, pending }
  }

  const sectionA = SECTION_A_KEYS.map((k) => evalLine('sectionA', k))
  const sectionB = SECTION_B_KEYS.map((k) => evalLine('sectionB', k))
  const sectionC = IN_HOUSE_OPERATIONS.map((op) => evalLine('sectionC', op.key))
  const sectionD = SECTION_D_KEYS.map((k) => evalLine('sectionD', k))
  const sectionE = SECTION_E_KEYS.map((k) => evalLine('sectionE', k))

  const sum = (lines: CostLine[]) => lines.reduce((s, l) => s + l.value, 0)
  vars.totalA = sum(sectionA)
  vars.totalB = sum(sectionB)
  vars.totalC = sum(sectionC)
  vars.totalD = sum(sectionD)
  vars.totalE = sum(sectionE)

  const evalSummary = (key: string): number => {
    const f = formulas[`sectionF.${key}`]
    if (!f) throw new Error(`Formula not loaded: sectionF.${key}`)
    const value = evaluateFormula(f.expression, vars)
    vars[key] = value
    return value
  }
  const summary: Record<string, number> = {}
  for (const key of SECTION_F_KEYS) summary[key] = evalSummary(key)

  return {
    sectionA,
    sectionB,
    sectionC,
    sectionD,
    sectionE,
    totalA: vars.totalA,
    totalB: vars.totalB,
    totalC: vars.totalC,
    totalD: vars.totalD,
    totalE: vars.totalE,
    totalDirectCostPerUnit: summary.totalDirectCostPerUnit,
    totalDirectCost: summary.totalDirectCost,
    listPrice: summary.listPrice,
    netOemPrice: summary.netOemPrice,
    priceInclGst: summary.priceInclGst,
    netPriceEur: summary.netPriceEur,
    grossMarginPercent: summary.grossMarginPercent,
    itemTotal: summary.itemTotal,
    qty,
  }
}

function computePulleyPricingStatic(values: PulleyTechDataValues): PulleyPricingResult {
  const r = PULLEY_COST_RATES
  const qty = num(values.qty) || 1

  const shellPlateWeight = num(values.shellPlateWeight)
  const hubMass = num(values.hubMass)
  const shaftMass = num(values.shaftMass)
  const shaftMaterial = String(values.shaftMaterial ?? '')
  const shellRatePerKg = num(values.shellRatePerKg) || r.rawForgingRates.shellPlateInrPerKg
  const endDiscRatePerKg = num(values.endDiskRatePerKg) || r.rawForgingRates.endDiscInrPerKg
  const totalPulleyMass = num(values.totalPulleyMass)

  const shaftMaterialRate = shaftMaterial === '42CrMo4+QT' ? r.rawForgingRates.shaft42CrMo4InrPerKg : r.rawForgingRates.shaftC45InrPerKg

  // SECTION A — RAW MATERIALS (rates from Raw Forging Prices — see rawForgingRates comment)
  const sectionA: CostLine[] = [
    { key: 'a1', label: 'A1. Shell / Body Material (IS 2062 E350)', value: shellRatePerKg * shellPlateWeight },
    { key: 'a2', label: 'A2. End Disc / End Plate Material (IS 2062)', value: endDiscRatePerKg * hubMass },
    { key: 'a3', label: 'A3. Hub Material (Cast Steel GS-52)', value: 0, pending: true },
    { key: 'a4', label: 'A4. Shaft Material (C45 / 42CrMo4+QT)', value: shaftMaterialRate * shaftMass },
    { key: 'a5', label: 'A5. Weld Consumables (per kg pulley)', value: r.weldConsumablesInrPerKgPulley * shellPlateWeight },
    { key: 'a6', label: 'A6. Grease (per kg pulley)', value: r.greaseInrPerKgPulley * hubMass },
  ]

  // SECTION B — ANCILLARY PARTS
  const bearing1Price = num(values.bearing1Price)
  const bearing2Price = num(values.bearing2Price)
  const sleevePrice = num(values.sleevePrice)
  const housingPrice = num(values.housingPrice)
  const lockingDevicePrice = num(values.lockingDevicePrice)
  const deadShaftParts = num(values.deadShaftParts)

  const sectionB: CostLine[] = [
    { key: 'b1', label: 'B1. Bearings (2× Drive + 2× Non-Drive)', value: bearing1Price + bearing2Price },
    { key: 'b2', label: 'B2. Adapter Sleeves (2×)', value: 2 * sleevePrice },
    { key: 'b3', label: 'B3. Bearing Housings (2×)', value: 2 * housingPrice },
    { key: 'b4', label: 'B4. Locking Device', value: lockingDevicePrice * 2 },
    { key: 'b5', label: 'B5. Lagging (supply & material only)', value: 0, pending: true },
    { key: 'b6', label: 'B6. Dead Shaft Parts (inner tube, supports, seals)', value: deadShaftParts, pending: deadShaftParts === 0 },
  ]

  // SECTION C — IN-HOUSE PROCESSING, from Section 9 (Run + Setup minutes x MHR rate)
  const sectionC: CostLine[] = IN_HOUSE_OPERATIONS.map((op) => {
    const runMin = num(values[`${op.key}RunMin`])
    const setupMin = num(values[`${op.key}SetupMin`])
    const cost = num(values[`${op.key}Cost`])
    return { key: op.key, label: op.label, value: cost, pending: runMin === 0 && setupMin === 0 }
  })

  // SECTION D — OUTSOURCED PROCESSING
  const laggingCost = num(values.laggingCost)
  const rollingOutsourced = values.srcRollingBending === 'Outsource'
  const sectionD: CostLine[] = [
    { key: 'd1', label: 'D1. Machining / Turning Body (Outsourced)', value: 0, pending: true },
    { key: 'd2', label: 'D2. Stress Relief Annealing (Outsourced)', value: values.srcStressRelief === 'Outsource' ? r.stressReliefInrPerKg * shellPlateWeight : 0 },
    { key: 'd3', label: 'D3. Heat Treatment – Normalising (Outsourced)', value: 0, pending: true },
    { key: 'd4', label: 'D4. Painting / Blasting (Outsourced)', value: values.srcPainting === 'Outsource' ? r.labourRatesInrPerHour.paintingSurfacePrep * num(values.laggingArea) : 0 },
    { key: 'd5', label: 'D5. Lagging Application Labour (Outsourced)', value: values.srcLagging === 'Outsource' ? laggingCost : 0 },
    { key: 'd6', label: 'D6. Dynamic Balancing (Outsourced per set)', value: values.srcBalancing === 'Outsource' ? r.balancingInrPerSet : 0 },
    { key: 'd7', label: 'D7. Rolling / Bending Shell (Outsourced)', value: rollingOutsourced ? r.machiningOutsourcedInrPerKg * shellPlateWeight * 0.5 : 0 },
    { key: 'd8', label: 'D8. Shaft Machining (always at specialty vendor)', value: 0, pending: true },
  ]

  // SECTION E — PACKING & SHIPMENT
  const sectionE: CostLine[] = [
    { key: 'e1', label: 'E1. Packing – Wood Crate (per 100 kg)', value: (totalPulleyMass / 100) * r.logistics.packingWoodCratePer100kg },
    { key: 'e2', label: 'E2. Inbound Freight – Shaft (per kg)', value: shaftMass * r.logistics.inboundFreightShaftPerKg },
    { key: 'e3', label: 'E3. Inbound Freight – Plates (per kg)', value: shellPlateWeight * r.logistics.inboundFreightPlatesPerKg },
    { key: 'e4', label: 'E4. Inbound Freight – Purchased Parts (per order)', value: r.logistics.inboundFreightPurchasedPartsPerOrder },
    { key: 'e5', label: 'E5. Outbound Shipping FOB (per kg)', value: totalPulleyMass * r.logistics.outboundShippingFobPerKg },
    { key: 'e6', label: 'E6. Other Miscellaneous Logistics / Inspection', value: 0, pending: true },
  ]

  const sum = (lines: CostLine[]) => lines.reduce((s, l) => s + l.value, 0)
  const totalA = sum(sectionA)
  const totalB = sum(sectionB)
  const totalC = sum(sectionC)
  const totalD = sum(sectionD)
  const totalE = sum(sectionE)

  const totalDirectCostPerUnit = totalA + totalB + totalC + totalD + totalE
  const totalDirectCost = totalDirectCostPerUnit * qty // matches the source sheet's own (A+B+C+D+E) x qty formula

  const listPrice = totalDirectCost * r.priceFactorMarkup
  const netOemPrice = listPrice * (1 - r.oemDiscount)
  const priceInclGst = netOemPrice * (1 + r.gstRate)
  const netPriceEur = netOemPrice / r.exchangeRateEurToInr
  const grossMarginPercent = listPrice > 0 ? ((listPrice - totalDirectCost) / listPrice) * 100 : 0
  // Mirrors the sample sheet's own C134 formula (Net OEM Price x Qty) — note this multiplies
  // qty in a second time on top of the qty already applied above; kept as-is to match the source.
  const itemTotal = netOemPrice * qty

  return {
    sectionA,
    sectionB,
    sectionC,
    sectionD,
    sectionE,
    totalA,
    totalB,
    totalC,
    totalD,
    totalE,
    totalDirectCostPerUnit,
    totalDirectCost,
    listPrice,
    netOemPrice,
    priceInclGst,
    netPriceEur,
    grossMarginPercent,
    itemTotal,
    qty,
  }
}

export function computePulleyPricing(values: PulleyTechDataValues): PulleyPricingResult {
  if (useFormulaStore.getState().loaded) {
    try {
      return computePulleyPricingDynamic(values)
    } catch (err) {
      console.warn('[computePulleyPricing] dynamic formula evaluation failed, using static calculation:', err)
    }
  }
  return computePulleyPricingStatic(values)
}
