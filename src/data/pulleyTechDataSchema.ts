/**
 * Mirrors the client's "TECH DATA SHEET" tab field-for-field (see
 * Sample _Drum_Drive_Pulley_Pricing Tool.xlsx). Frontend-only for now —
 * fields marked auto are shown read-only until the real calculation
 * engine (Pricing Tool / Cost Rate Tables / MHR & LHR) is wired up.
 */

import { BRG_CATALOG, SLEEVE_CATALOG, HOUSING_CATALOG, LAGGING_CATALOG, LOCKING_DEVICE_CATALOG } from '@/data/pulleyCatalogs'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'

export type FieldType = 'text' | 'number' | 'select'

export interface TechDataField {
  key: string
  label: string
  unit?: string
  type: FieldType
  options?: string[]
  auto?: boolean
}

export interface TechDataSection {
  title: string
  fields: TechDataField[]
}

export const SOURCING_OPTIONS = ['In-house', 'Outsource', 'Logistics']

/** The bought-out, catalog-priced components (Sections 5-7) — always purchased, never in-house. */
export const BOUGHT_OUT_COMPONENTS: { key: string; label: string; designationKey: string; priceKey: string; priceUnit?: string }[] = [
  { key: 'bearing1', label: 'Bearing 1', designationKey: 'bearing1Designation', priceKey: 'bearing1Price' },
  { key: 'bearing2', label: 'Bearing 2', designationKey: 'bearing2Designation', priceKey: 'bearing2Price' },
  { key: 'sleeve', label: 'Adapter Sleeve', designationKey: 'sleeveCode', priceKey: 'sleevePrice' },
  { key: 'housing', label: 'Bearing Housing', designationKey: 'housingDesignation', priceKey: 'housingPrice' },
  { key: 'lagging', label: 'Lagging', designationKey: 'laggingType', priceKey: 'laggingRate', priceUnit: '/m²' },
  { key: 'lockingDevice', label: 'Locking Device', designationKey: 'lockingDeviceType', priceKey: 'lockingDevicePrice' },
]

/**
 * Links each of Section 8's 7 in-house/outsource process decisions to the matching
 * cost line(s) in computePulleyPricing()'s Section C (in-house) / Section D (outsourced) —
 * the two sheets don't line up 1:1 (e.g. Welding has no outsourced-cost line in the source
 * workbook), so a missing key means that combination has no costed line yet.
 */
export const PROCESS_SOURCING_MAP: { srcKey: string; label: string; cKey?: string; dKey?: string }[] = [
  { srcKey: 'srcRollingBending', label: 'Rolling / Bending Shell', cKey: 'c1', dKey: 'd7' },
  { srcKey: 'srcWelding', label: 'Welding (Shell + Hub)', cKey: 'c2' },
  { srcKey: 'srcStressRelief', label: 'Stress Relief Annealing', dKey: 'd2' },
  { srcKey: 'srcMachining', label: 'Turning / Machining (Body)', cKey: 'c3', dKey: 'd1' },
  { srcKey: 'srcLagging', label: 'Lagging Application', dKey: 'd5' },
  { srcKey: 'srcBalancing', label: 'Static Balancing', dKey: 'd6' },
  { srcKey: 'srcPainting', label: 'Painting / Blasting', cKey: 'c6', dKey: 'd4' },
]

/** The 7 in-house operations from the "In-House Hours" tab, each costed via its MHR rate. */
export const IN_HOUSE_OPERATIONS: { key: string; label: string; rateKey: keyof typeof PULLEY_COST_RATES.labourRatesInrPerHour }[] = [
  { key: 'c1', label: 'C1. Rolling / Bending Shell', rateKey: 'rollingBending' },
  { key: 'c2', label: 'C2. Welding – Shell & Hub', rateKey: 'weldingMigMag' },
  { key: 'c3', label: 'C3. Machining / Turning Body', rateKey: 'latheTurning' },
  { key: 'c4', label: 'C4. Assembly + Engineering', rateKey: 'assemblyLabour' },
  { key: 'c5', label: 'C5. Testing / Inspection / QC', rateKey: 'engineeringDesign' },
  { key: 'c6', label: 'C6. Painting & Surface Prep', rateKey: 'paintingSurfacePrep' },
  { key: 'c7', label: 'C7. Hub Pre-Turning', rateKey: 'latheTurning' },
]

function inHouseHoursFields(): TechDataField[] {
  return IN_HOUSE_OPERATIONS.flatMap((op) => {
    const rate = PULLEY_COST_RATES.labourRatesInrPerHour[op.rateKey]
    return [
      { key: `${op.key}RunMin`, label: `${op.label} — Run Time`, unit: 'min', type: 'number' as const },
      { key: `${op.key}SetupMin`, label: `${op.label} — Setup Time`, unit: 'min', type: 'number' as const },
      { key: `${op.key}TotalHours`, label: `${op.label} — Total Hours`, unit: 'h', type: 'number' as const, auto: true },
      { key: `${op.key}Cost`, label: `${op.label} — Cost @ ₹${rate}/hr`, unit: 'INR', type: 'number' as const, auto: true },
    ]
  })
}

export const HEADER_FIELDS: TechDataField[] = [
  { key: 'customerName', label: 'Customer Name', type: 'text' },
  { key: 'finalDestination', label: 'Final Destination', type: 'text' },
  { key: 'paymentTerms', label: 'Payment Terms', type: 'text' },
  { key: 'incoterms', label: 'Incoterms', type: 'text' },
  { key: 'techDataContact', label: 'Technical Data Contact', type: 'text' },
  { key: 'deliveryTime', label: 'Delivery Time', type: 'text' },
  { key: 'version', label: 'Version', type: 'text' },
  { key: 'quoteDate', label: 'Date', type: 'text' },
]

export const TECH_DATA_SECTIONS: TechDataSection[] = [
  {
    title: '1. PROJECT INFORMATION',
    fields: [
      { key: 'quoteReference', label: 'Project / Quote Reference', type: 'text' },
      { key: 'pulleyTag', label: 'Pulley Tag / Name', type: 'text' },
      { key: 'pulleyStructure', label: 'Pulley Structure', type: 'text' },
      { key: 'qty', label: 'Number of Pulleys (qty)', unit: 'nos', type: 'number' },
    ],
  },
  {
    title: '2. PULLEY BODY DIMENSIONS',
    fields: [
      { key: 'shellOD', label: 'Shell Outer Diameter  Dshell', unit: 'mm', type: 'number' },
      { key: 'shellFaceWidth', label: 'Shell Face Width  Lface', unit: 'mm', type: 'number' },
      { key: 'shellRawThickness', label: 'Shell Raw Thickness', unit: 'mm', type: 'number' },
      { key: 'sheetWidth', label: 'Sheet Width', unit: 'mm', type: 'number' },
      { key: 'sheetLength', label: 'Sheet Length', unit: 'mm', type: 'number', auto: true },
      { key: 'overallDiaWithLagging', label: 'Overall Pulley Diameter with Lagging', unit: 'mm', type: 'number' },
      { key: 'bearingHousingDistance', label: 'Bearing Housing Distance  L1', unit: 'mm', type: 'number' },
      { key: 'totalPulleyMass', label: 'Total Pulley Mass  mtotal', unit: 'kg', type: 'number' },
      { key: 'shellPlateWeight', label: 'Sheel Plate Weight', unit: 'kg', type: 'number', auto: true },
      { key: 'shellRatePerKg', label: 'Shell Rate Per Kg', unit: 'INR', type: 'number' },
    ],
  },
  {
    title: '3. HUB SPECIFICATIONS',
    fields: [
      { key: 'hubType', label: 'Hub Type', type: 'text' },
      { key: 'hubWidth', label: 'Hub Width  Whub', unit: 'mm', type: 'number' },
      { key: 'hubMinOD', label: 'Min. Outer Diameter of Hub  DN', unit: 'mm', type: 'number' },
      { key: 'hubID', label: 'Hub Inner Diameter  d_LD (= LD bore)', unit: 'mm', type: 'number' },
      { key: 'hubMass', label: 'Hub Mass (est., 2 hubs)', unit: 'kg', type: 'number', auto: true },
      { key: 'endDiskRatePerKg', label: 'End Disk Per Kg', unit: 'INR', type: 'number' },
    ],
  },
  {
    title: '4. SHAFT SPECIFICATIONS',
    fields: [
      { key: 'shaftLength', label: 'Shaft Total Length  Lshaft', unit: 'mm', type: 'number' },
      { key: 'shaftDiameter', label: 'Shaft Centre Diameter  d4', unit: 'mm', type: 'number' },
      { key: 'shaftMaterial', label: 'Shaft Material', type: 'text' },
      { key: 'shaftMass', label: 'Shaft Mass', unit: 'kg', type: 'number', auto: true },
      { key: 'shaftRatePerKg', label: 'Shaft Per Kg', unit: 'INR', type: 'number' },
    ],
  },
  {
    title: '5. BEARINGS, HOUSINGS & SLEEVES',
    fields: [
      { key: 'bearing1Designation', label: 'Bearing 1 Designation', type: 'select' },
      { key: 'bearing1Price', label: 'Bearing 1 Price', unit: 'INR/ea', type: 'number', auto: true },
      { key: 'bearing2Designation', label: 'Bearing 2 Designation', type: 'select' },
      { key: 'bearing2Price', label: 'Bearing 2 Price', unit: 'INR/ea', type: 'number', auto: true },
      { key: 'sleeveCode', label: 'Adapter Sleeve Code', type: 'select' },
      { key: 'sleevePrice', label: 'Sleeve Price', unit: 'INR/ea', type: 'number', auto: true },
      { key: 'housingDesignation', label: 'Housing Designation', type: 'select' },
      { key: 'housingPrice', label: 'Housing Price', unit: 'INR/ea', type: 'number', auto: true },
      { key: 'totalBearingsHousings', label: 'Total Bearings + Sleeves + Housings (2× each)', unit: 'INR', type: 'number', auto: true },
    ],
  },
  {
    title: '6. LAGGING',
    fields: [
      { key: 'laggingType', label: 'Lagging Type', type: 'select' },
      { key: 'laggingThickness', label: 'Lagging Thickness', unit: 'mm', type: 'number' },
      { key: 'laggingArea', label: 'Lagging Area', unit: 'm²', type: 'number', auto: true },
      { key: 'laggingRate', label: 'Lagging Rate', unit: 'INR/m²', type: 'number', auto: true },
      { key: 'laggingCost', label: 'Lagging Cost', unit: 'INR', type: 'number', auto: true },
    ],
  },
  {
    title: '7. LOCKING DEVICE & DEAD SHAFT PARTS',
    fields: [
      { key: 'lockingDeviceType', label: 'Locking Device Type', type: 'select' },
      { key: 'lockingDevicePrice', label: 'Locking Device INR Price', unit: 'INR', type: 'number', auto: true },
      { key: 'deadShaftParts', label: 'Dead Shaft Parts (inner tube, supports, seals)', unit: 'INR', type: 'number' },
    ],
  },
  {
    title: '8. SOURCING SELECTION — In-house or Outsource per Process',
    fields: [
      { key: 'srcRollingBending', label: 'Rolling / Bending Shell', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcWelding', label: 'Welding (Shell + Hub)', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcStressRelief', label: 'Stress Relief Annealing', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcMachining', label: 'Turning / Machining (Body)', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcLagging', label: 'Lagging Application', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcBalancing', label: 'Static Balancing', type: 'select', options: SOURCING_OPTIONS },
      { key: 'srcPainting', label: 'Painting / Blasting', type: 'select', options: SOURCING_OPTIONS },
    ],
  },
  {
    title: '9. IN-HOUSE PROCESSING HOURS',
    fields: inHouseHoursFields(),
  },
]

const FIELD_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TECH_DATA_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.unit ? `${f.label} (${f.unit})` : f.label])),
)

export function getFieldLabel(fieldKey: string): string {
  return FIELD_LABEL_MAP[fieldKey] ?? fieldKey
}

export function getOptionsForField(fieldKey: string): string[] {
  switch (fieldKey) {
    case 'bearing1Designation':
    case 'bearing2Designation':
      return BRG_CATALOG.map((b) => b.designation)
    case 'sleeveCode':
      return [...new Set(SLEEVE_CATALOG.map((s) => s.sleeveCode))].filter(Boolean)
    case 'housingDesignation':
      return [...new Set(HOUSING_CATALOG.map((h) => h.housingDesignation))].filter(Boolean)
    case 'laggingType':
      return LAGGING_CATALOG.map((l) => l.laggingType)
    case 'lockingDeviceType':
      return LOCKING_DEVICE_CATALOG.map((l) => l.model)
    default:
      return []
  }
}

/** Auto-priced fields whose value can be looked up from a catalog once its designation is picked. */
export function lookupCatalogPrice(fieldKey: string, designation: string): number | null {
  switch (fieldKey) {
    case 'bearing1Price':
    case 'bearing2Price':
      return BRG_CATALOG.find((b) => b.designation === designation)?.priceInr ?? null
    case 'sleevePrice':
      return SLEEVE_CATALOG.find((s) => s.sleeveCode === designation)?.priceInr ?? null
    case 'housingPrice':
      return HOUSING_CATALOG.find((h) => h.housingDesignation === designation)?.priceInr ?? null
    case 'lockingDevicePrice':
      return LOCKING_DEVICE_CATALOG.find((l) => l.model === designation)?.negotiatedRateInr ?? null
    case 'laggingRate':
      return LAGGING_CATALOG.find((l) => l.laggingType === designation)?.priceInrPerM2 ?? null
    default:
      return null
  }
}

/** Which "designation" field this auto-priced field should watch. */
export const PRICE_FIELD_SOURCE: Record<string, string> = {
  bearing1Price: 'bearing1Designation',
  bearing2Price: 'bearing2Designation',
  sleevePrice: 'sleeveCode',
  housingPrice: 'housingDesignation',
  lockingDevicePrice: 'lockingDeviceType',
  laggingRate: 'laggingType',
}
