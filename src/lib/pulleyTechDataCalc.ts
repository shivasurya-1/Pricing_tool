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
import { DESIGNATION_TO_PRICE_FIELD, lookupCatalogPrice, IN_HOUSE_OPERATIONS, type TechDataSection } from '@/data/pulleyTechDataSchema'
import { useFormulaStore } from '@/store/formulaStore'
import { useReferenceStore } from '@/store/referenceStore'
import { evaluateFormula } from '@/lib/formulaEval'

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

/** One pulley's In-House Hours variables, per operation c1 … c7 (backend list:
 * formulas.views.IN_HOUSE_HOURS_VARIABLES):
 *  - c#RunMin / c#SetupMin: the minutes entered for this pulley on the In-House Hours
 *    page, else that operation's default minutes there;
 *  - c#TotalMin = run + setup; c#RateInrPerHour: the operation's MHR rate;
 *  - c#InHouseCost = rate × total minutes — the workbook's In-House Hours sheet (=$E7*H7).
 * Rates and defaults come from the row with that operation_code; an operation with no row
 * reads 0 and is listed in `missing`, the same as the workbook's IFNA(VLOOKUP(...), 0).
 * While the backend is unreachable, the workbook's own rates and minutes are used. */
export function inHouseHoursVars(values: PulleyTechDataValues): { vars: Record<string, number>; missing: string[] } {
  const { loaded, inHouseHourRates } = useReferenceStore.getState()
  const vars: Record<string, number> = {}
  const missing: string[] = []
  for (const code of inHouseOperationCodes()) {
    const op = IN_HOUSE_OPERATIONS.find((o) => o.key === code)
    const row = loaded ? inHouseHourRates.find((r) => r.operation_code === code) : undefined
    if (loaded && !row) missing.push(code)
    const rate = loaded ? (row?.mhr_rate ?? 0) : (op?.workbookRate ?? 0)
    const runDefault = loaded ? (row?.default_run_min ?? 0) : (op?.workbookRunMin ?? 0)
    const setupDefault = loaded ? (row?.default_setup_min ?? 0) : (op?.workbookSetupMin ?? 0)
    const run = isBlank(values[`${code}RunMin`]) ? runDefault : num(values[`${code}RunMin`])
    const setup = isBlank(values[`${code}SetupMin`]) ? setupDefault : num(values[`${code}SetupMin`])
    vars[`${code}RateInrPerHour`] = rate
    vars[`${code}RunMin`] = run
    vars[`${code}SetupMin`] = setup
    vars[`${code}TotalMin`] = run + setup
    vars[`${code}InHouseCost`] = rate * (run + setup)
  }
  return { vars, missing }
}

/** The Section C operations: the built-in c1 … c7 plus every line added on the In-House
 * Hours page (c8, c9, …), in order — the backend's in_house_operation_codes(). */
export function inHouseOperationCodes(): string[] {
  const { loaded, inHouseHourRates } = useReferenceStore.getState()
  const codes = new Set(IN_HOUSE_OPERATIONS.map((op) => op.key))
  if (loaded) for (const r of inHouseHourRates) if (r.operation_code) codes.add(r.operation_code)
  return [...codes].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

/** An operation's name: its row's activity description on the In-House Hours page, else
 * the built-in label (e.g. "C7. Hub Pre-Turning"), else just its code. */
export function inHouseOperationLabel(code: string): string {
  const row = useReferenceStore.getState().inHouseHourRates.find((r) => r.operation_code === code)
  return row?.activity_description || IN_HOUSE_OPERATIONS.find((op) => op.key === code)?.label || code.toUpperCase()
}

/** Prices a just-picked designation: `catalog_prices` (label -> its paired catalog
 * price, always present for a catalog-linked select regardless of Price Field) wins
 * when present. `option_prices` is NOT used here — it only holds this field's own
 * resolved value when value_field is set (i.e. when this field's value IS a price,
 * not a designation), so it's the wrong map for pricing a *paired* field like
 * bearing1Price from bearing1Designation. Falls back to lookupCatalogPrice() only
 * when the field isn't catalog-linked server-side yet (e.g. backend unreachable). */
function resolveDesignationPrice(designationKey: string, priceKey: string, designationValue: string): number | null {
  const field = useFormulaStore.getState().techDataFields[designationKey]
  if (field?.catalog_prices) return field.catalog_prices[designationValue] ?? null
  return lookupCatalogPrice(priceKey, designationValue)
}

export type PulleyModelValues = PulleyTechDataValues

const num = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Exported so the Formulas page's preview feature can build the same variable bag
 * from a real sample item as computeAutoFieldsDynamic does.
 *
 * A blank/whitespace-only string must be skipped, not coerced — Number('') is 0, so
 * without this check an unset field would silently read as a real zero instead of
 * "no value", e.g. overwriting a freshly computed Auto value with a stale blank one. */
export function toNumericVars(values: PulleyTechDataValues): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) continue
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isNaN(n)) out[k] = n
  }
  return out
}

/** toNumericVars() plus what the Formulas page set up: a field left empty on this item
 * reads as its fixed value, and a catalog-linked select reads as its picked row's price
 * (option_prices) rather than its label — otherwise both would evaluate as 0. */
export function fieldNumericVars(values: PulleyTechDataValues): Record<string, number> {
  const out = toNumericVars(values)
  for (const f of Object.values(useFormulaStore.getState().techDataFields)) {
    if (f.is_auto) continue
    const raw = values[f.key]
    if (raw === undefined || raw === null || raw === '') {
      if (f.fixed_numeric_value != null) out[f.key] = f.fixed_numeric_value
      else if (f.fixed_value && !Number.isNaN(Number(f.fixed_value))) out[f.key] = Number(f.fixed_value)
    } else if (f.option_prices) {
      const price = f.option_prices[String(raw)]
      if (price != null) out[f.key] = Number(price)
    }
  }
  return out
}

/**
 * Evaluates every Auto Technical Data Sheet field (the ~21 known ones plus any custom
 * field added later via the Formulas page's "Add Field" flow) in dependency order,
 * rather than a hand-maintained call sequence — so a new Auto field that depends on
 * another Auto field's output just works regardless of when it was declared.
 *
 * An auto field only depends on OTHER auto fields for ordering purposes: a dependency
 * on a manual field, or on an injected rate-lookup variable (c1RateInrPerHour etc.),
 * is already sitting in `vars` before evaluation starts and needs no ordering at all.
 * Kahn's algorithm; a cycle throws (caught by computeAutoFields(), which falls back to
 * computeAutoFieldsStatic()) rather than ever silently mis-evaluating.
 */
function computeAutoFieldsDynamic(values: PulleyTechDataValues): PulleyTechDataValues {
  const { techDataFields, costRates } = useFormulaStore.getState()
  // Every Cost Rate Tables key is now insertable directly into an Auto field's
  // expression — spread first so a sheet field sharing the same key still wins.
  const vars: Record<string, number> = { ...costRates, ...fieldNumericVars(values), ...inHouseHoursVars(values).vars }
  const out: PulleyTechDataValues = {}

  const autoFields = Object.values(techDataFields).filter((f) => f.is_auto)
  if (autoFields.length === 0) throw new Error('No Auto fields loaded from the backend')
  const autoKeys = new Set(autoFields.map((f) => f.key))

  // A formula that reads a catalog price variable (e.g. bearing2Price) effectively also
  // depends on that price's designation field (bearing2Designation) whenever the
  // designation itself is an Auto (copy) field — otherwise a calc like the bearings
  // total could run before the designation it was copied from has been priced. Derived
  // from DESIGNATION_TO_PRICE_FIELD rather than PRICE_FIELD_SOURCE directly so a
  // renamed designation key (e.g. adapterSleeveCode) is still found.
  const priceKeyToDesignationKey = new Map(Object.entries(DESIGNATION_TO_PRICE_FIELD).map(([d, p]) => [p, d]))
  const designationKeyFor = (priceKey: string): string | undefined => priceKeyToDesignationKey.get(priceKey)

  const dependsOn = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()
  for (const f of autoFields) {
    const deps = new Set<string>()
    for (const v of f.input_variables ?? []) {
      if (v === f.key) continue
      if (autoKeys.has(v)) deps.add(v)
      const designationKey = designationKeyFor(v)
      if (designationKey && autoKeys.has(designationKey) && designationKey !== f.key) deps.add(designationKey)
    }
    dependsOn.set(f.key, deps)
    for (const d of deps) {
      if (!dependents.has(d)) dependents.set(d, new Set())
      dependents.get(d)!.add(f.key)
    }
  }

  const ready = autoFields.filter((f) => dependsOn.get(f.key)!.size === 0).map((f) => f.key)
  const order: string[] = []
  while (ready.length > 0) {
    const key = ready.shift()!
    order.push(key)
    for (const dependent of dependents.get(key) ?? []) {
      const deps = dependsOn.get(dependent)!
      deps.delete(key)
      if (deps.size === 0) ready.push(dependent)
    }
  }
  if (order.length !== autoFields.length) {
    throw new Error('Circular dependency among Auto Technical Data Sheet fields')
  }

  const byKey = new Map(autoFields.map((f) => [f.key, f]))
  for (const key of order) {
    const f = byKey.get(key)!

    if (f.copy_from) {
      // Copy the source's raw value as-is (text, number or selected option) — no
      // calculation, no rounding. The source may itself be an Auto field already
      // resolved earlier in `order`, or a plain Manual field sitting in `values`.
      // A source that isn't a sheet field (a Cost Rate Tables key, an MHR rate) has no
      // value on the item — copy its rate instead.
      const isSheetField = autoKeys.has(f.copy_from) || techDataFields[f.copy_from] !== undefined
      const copied = autoKeys.has(f.copy_from)
        ? (out[f.copy_from] ?? '')
        : isSheetField
          ? (values[f.copy_from] ?? '')
          : (vars[f.copy_from] ?? '')
      out[key] = copied
      const n = typeof copied === 'number' ? copied : Number(copied)
      if (copied !== '' && !Number.isNaN(n)) vars[key] = n

      // A copied designation (e.g. bearing2Designation) re-triggers its catalog price
      // lookup, same as a manual edit would via applyFieldChange.
      const priceKey = DESIGNATION_TO_PRICE_FIELD[key]
      if (priceKey) {
        const priced = resolveDesignationPrice(key, priceKey, String(copied))
        if (priced !== null) {
          vars[priceKey] = priced
          out[priceKey] = priced
        }
      }
      continue
    }

    const result = evaluateFormula(f.expression as string, vars)
    vars[key] = result
    out[key] = round2(result)
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

  return {
    sheetLength: round2(sheetLength),
    shellPlateWeight: round2(shellPlateWeight),
    hubMass: round2(hubMass),
    shaftMass: round2(shaftMass),
    laggingArea: round2(laggingArea),
    laggingCost: round2(laggingCost),
    totalBearingsHousings: round2(totalBearingsHousings),
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

/** Applies one field edit, then re-runs catalog price lookups and geometry auto-calcs.
 * Shared by every screen that edits a pulley's technical data.
 *
 * `autoOverrideKeys` lists Auto fields this item has been manually overridden on (see
 * TechDataFieldOverride.autoOverridden) — without this, every edit anywhere on the form
 * would silently recompute and clobber a value the user typed in for one of them. */
export function applyFieldChange(
  values: PulleyTechDataValues,
  fieldKey: string,
  rawValue: string | number,
  autoOverrideKeys?: Set<string>,
): PulleyTechDataValues {
  let next: PulleyTechDataValues = { ...values, [fieldKey]: rawValue }

  const priceKey = DESIGNATION_TO_PRICE_FIELD[fieldKey]
  if (priceKey) {
    const priced = resolveDesignationPrice(fieldKey, priceKey, String(rawValue))
    if (priced !== null) next[priceKey] = priced
  }

  const computed = computeAutoFields(next)
  if (autoOverrideKeys?.size) {
    for (const key of autoOverrideKeys) delete computed[key]
  }
  next = { ...next, ...computed }
  return next
}

/** Writes every field's fixed value (set on the Formulas page) into the sheet, through
 * applyFieldChange so catalog prices and auto-calcs follow — e.g. a fixed Housing
 * Designation also fills Housing Price. Pass sections that already have this item's
 * per-RFQ overrides applied, so an overridden field keeps whatever was typed. */
export function applyFixedValues(values: PulleyTechDataValues, sections: TechDataSection[]): PulleyTechDataValues {
  let next = values
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.auto || field.fixedValue === undefined) continue
      const fixed = field.type === 'number' ? Number(field.fixedValue) : field.fixedValue
      if (next[field.key] !== fixed) next = applyFieldChange(next, field.key, fixed)
    }
  }
  return next
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
