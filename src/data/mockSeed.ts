import type {
  AppNotification,
  AuditEvent,
  CostBreakdownLine,
  Customer,
  InHouseCapability,
  Priority,
  Product,
  Quotation,
  QuotationStatus,
  RateCard,
  RFQ,
  RFQItem,
  Role,
  SourcingType,
  Stage,
  User,
  Vendor,
} from '@/types'
import { STAGE_ORDER } from '@/lib/workflow'
import { calculateCostBreakdown } from '@/lib/pricing'
import { makeHelpers } from '@/lib/rng'
import { computeAutoFields } from '@/lib/pulleyTechDataCalc'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'
import { BRG_CATALOG, SLEEVE_CATALOG, HOUSING_CATALOG, LAGGING_CATALOG, LOCKING_DEVICE_CATALOG } from '@/data/pulleyCatalogs'
import type { PulleyTechDataValues } from '@/types'

const NOW = new Date('2026-08-28T10:00:00')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

// ---------------------------------------------------------------------------
// Demo users / role personas
// ---------------------------------------------------------------------------

export const DEMO_PERSONA: Record<Role, { name: string; email: string; color: string }> = {
  Sales: { name: 'Ananya Sharma', email: 'ananya.sharma@apex-erp-demo.com', color: '#2563eb' },
  Operations: { name: 'Rakesh Menon', email: 'rakesh.menon@apex-erp-demo.com', color: '#0d9488' },
  Sourcing: { name: 'Divya Prasad', email: 'divya.prasad@apex-erp-demo.com', color: '#7c3aed' },
  Controlling: { name: 'Vikram Desai', email: 'vikram.desai@apex-erp-demo.com', color: '#ea580c' },
  'Approval Panel': { name: 'Sunita Rao', email: 'sunita.rao@apex-erp-demo.com', color: '#2563eb' },
  Admin: { name: 'Admin User', email: 'admin@apex-erp-demo.com', color: '#10192b' },
}

export function buildUsers(): User[] {
  const roleUsers: User[] = (Object.keys(DEMO_PERSONA) as Role[]).map((role, i) => ({
    id: `u-${role.toLowerCase().replace(/\s+/g, '-')}`,
    name: DEMO_PERSONA[role].name,
    email: DEMO_PERSONA[role].email,
    role,
    department: role === 'Admin' ? 'IT / Administration' : role,
    status: 'Active',
    lastLogin: daysAgo(i),
    avatarColor: DEMO_PERSONA[role].color,
  }))
  const extraSales: User[] = ['Karthik Iyer', 'Priya Nair'].map((name, i) => ({
    id: `u-sales-${i + 2}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@apex-erp-demo.com`,
    role: 'Sales',
    department: 'Sales',
    status: 'Active',
    lastLogin: daysAgo(i + 2),
    avatarColor: '#2563eb',
  }))
  return [...roleUsers, ...extraSales]
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function buildCustomers(): Customer[] {
  const raw: Array<[string, string, string, string, string]> = [
    ['Apex Mining Industries', 'Suresh Pillai', 'Bhubaneswar', '27AACCA1234F1Z5', 'Net 45'],
    ['Global Conveyor Systems', 'Meera Krishnan', 'Chennai', '33AACCG5678K1Z2', 'Net 30'],
    ['Eastern Engineering', 'Alok Bannerjee', 'Kolkata', '19AACCE9012M1Z8', 'Net 30'],
    ['Nova Cement Works', 'Farhan Sheikh', 'Ahmedabad', '24AACCN3456P1Z3', 'Net 60'],
    ['Metro Industrial Projects', 'Neha Kapoor', 'Pune', '27AACCM7890Q1Z9', 'Net 45'],
  ]
  return raw.map(([name, contact, city, taxId, terms], i) => ({
    id: `cust-${i + 1}`,
    code: `CUST-${String(i + 1).padStart(3, '0')}`,
    name,
    contact,
    email: `${contact.toLowerCase().replace(/\s+/g, '.')}@${name.toLowerCase().split(' ')[0]}.com`,
    phone: `+91 98${String(10000000 + i * 7654321).slice(0, 8)}`,
    city,
    taxId,
    paymentTerms: terms,
    status: 'Active',
    updatedAt: daysAgo(i * 3 + 1),
  }))
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export function buildVendors(): Vendor[] {
  const raw: Array<[string, string, number, string]> = [
    ['SKF', 'Bearings', 4.7, 'Net 30'],
    ['Timken', 'Bearings', 4.5, 'Net 45'],
    ['ABC Industrial Supplies', 'Fabrication', 3.9, 'Net 30'],
    ['Global Mechanical', 'Machining & Shafts', 4.1, 'Net 60'],
    ['Prime Components', 'Pulleys & Idlers', 4.3, 'Net 30'],
  ]
  return raw.map(([name, category, rating, terms], i) => ({
    id: `vend-${i + 1}`,
    code: `VND-${String(i + 1).padStart(3, '0')}`,
    name,
    category,
    contact: `${name.split(' ')[0]} Sales Desk`,
    email: `sales@${name.toLowerCase().replace(/\s+/g, '')}.com`,
    rating,
    paymentTerms: terms,
    status: 'Active',
  }))
}

// ---------------------------------------------------------------------------
// Products + technical data
// ---------------------------------------------------------------------------

const HUB_TYPES = ['Welded-in hub', 'Compression hub (XT/QD)', 'Keyed shaft hub', 'Taper lock hub']
const SHAFT_MATERIALS = ['42CrMo4+QT forged', 'EN8 forged', 'SAE 1045 forged', 'AISI 4140 forged']
const BEARINGS = ['22234 CCK/W33', '22228 CC/W33', '22318 CC/W33', '23224 CCK/W33', '22322 CC/W33']

function generateTechnicalData(sizeFactor: number, rng: ReturnType<typeof makeHelpers>): Record<string, string | number> {
  const shellOD = Math.round(sizeFactor * 1000)
  return {
    'Shell Outer Diameter': `${shellOD} mm`,
    'Shell Face Width': `${Math.round(1200 + sizeFactor * 400)} mm`,
    'Shell Thickness': `${Math.round(16 + sizeFactor * 16)} mm`,
    'Sheet Width': `${Math.round(1200 + sizeFactor * 400)} mm`,
    'Sheet Length': `${Math.round(1800 + sizeFactor * 1400)} mm`,
    'Overall Pulley Diameter': `${Math.round(shellOD * 0.6)} mm`,
    'Housing Distance': `${Math.round(700 + sizeFactor * 600)} mm`,
    'Total Pulley Mass': `${Math.round(80 + sizeFactor * 140)} kg`,
    'Hub Type': rng.pick(HUB_TYPES),
    'Hub Width': `${Math.round(80 + sizeFactor * 80)} mm`,
    'Hub Outer Diameter': `${Math.round(shellOD * 0.65)} mm`,
    'Hub Inner Diameter': `${Math.round(shellOD * 0.23)} mm`,
    'Shaft Length': `${Math.round(1800 + sizeFactor * 1400)} mm`,
    'Shaft Centre Diameter': `${Math.round(140 + sizeFactor * 140)} mm`,
    'Shaft Material': rng.pick(SHAFT_MATERIALS),
    'Bearing Designation': rng.pick(BEARINGS),
  }
}

export function buildProducts(): Product[] {
  const rng = makeHelpers(20260828)
  const specs: Array<[string, string, string, number, number, SourcingType]> = [
    ['HT Drive Pulley', 'PLY-DR-800', 'Drive Pulley', 0.8, 620000, 'Both'],
    ['HT Non Drive Pulley', 'PLY-NDR-800', 'Non-Drive Pulley', 0.8, 480000, 'Both'],
    ['Double Drive Pulley SPL-03', 'PLY-DD-SPL03', 'Drive Pulley', 1.0, 780000, 'Out-House'],
    ['Single Drive Pulley SPL-04', 'PLY-SD-SPL04', 'Drive Pulley', 0.63, 390000, 'Both'],
    ['Single Drive Pulley SPL-06', 'PLY-SD-SPL06', 'Drive Pulley', 0.71, 430000, 'Both'],
    ['Single Drive Pulley SPL-07', 'PLY-SD-SPL07', 'Drive Pulley', 0.75, 460000, 'In-House'],
    ['HT Snub Pulley', 'PLY-SNB-630', 'Snub/Bend Pulley', 0.63, 210000, 'In-House'],
    ['HT Bend Pulley', 'PLY-BND-710', 'Snub/Bend Pulley', 0.71, 240000, 'In-House'],
    ['HT Take-up Pulley', 'PLY-TKP-560', 'Take-up Pulley', 0.56, 260000, 'Both'],
    ['Wing Pulley WP-500', 'PLY-WNG-500', 'Wing Pulley', 0.5, 195000, 'Out-House'],
    ['Rubber Lagged Drive Pulley RL-900', 'PLY-RL-900', 'Lagged Pulley', 0.9, 710000, 'Out-House'],
    ['Ceramic Lagged Head Pulley CL-1000', 'PLY-CL-1000', 'Lagged Pulley', 1.0, 860000, 'Out-House'],
  ]

  return specs.map(([name, code, category, sizeFactor, basePrice, sourcingType], i) => {
    const technicalData =
      name === 'HT Drive Pulley'
        ? {
            'Shell Outer Diameter': '800 mm',
            'Shell Face Width': '1400 mm',
            'Shell Thickness': '26 mm',
            'Sheet Width': '1400 mm',
            'Sheet Length': '2557 mm',
            'Overall Pulley Diameter': '483 mm',
            'Housing Distance': '1011 mm',
            'Total Pulley Mass': '150 kg',
            'Hub Type': 'Welded-in hub',
            'Hub Width': '119 mm',
            'Hub Outer Diameter': '818 mm',
            'Hub Inner Diameter': '290 mm',
            'Shaft Length': '2521 mm',
            'Shaft Centre Diameter': '228 mm',
            'Shaft Material': '42CrMo4+QT forged',
            'Bearing Designation': '22234 CCK/W33',
          }
        : generateTechnicalData(sizeFactor, rng)

    return {
      id: `prod-${i + 1}`,
      code,
      name,
      category,
      unit: 'Nos',
      description: `${category} for heavy-duty belt conveyor applications, shell diameter ~${Math.round(sizeFactor * 1000)} mm.`,
      defaultLeadTimeDays: rng.randInt(20, 45),
      basePrice,
      status: 'Active',
      technicalData,
      preferredVendorIds: ['vend-5', rng.pick(['vend-1', 'vend-2', 'vend-3', 'vend-4'])],
      sourcingType,
    }
  })
}

// ---------------------------------------------------------------------------
// In-house production capability (the "inside" counterpart to the Vendor master)
// ---------------------------------------------------------------------------

export function buildInHouseCapabilities(): InHouseCapability[] {
  const raw: Array<[string, string, number, number, number]> = [
    ['Line 1 — Drive Pulley Fabrication', 'Drive Pulley', 40, 0.9, 25],
    ['Line 2 — Non-Drive & Snub/Bend Fabrication', 'Non-Drive Pulley', 35, 0.88, 22],
    ['Line 2 — Non-Drive & Snub/Bend Fabrication (Snub/Bend)', 'Snub/Bend Pulley', 30, 0.85, 20],
    ['Line 3 — Take-up Pulley Cell', 'Take-up Pulley', 20, 0.92, 28],
  ]
  return raw.map(([name, category, capacityPerMonth, costFactor, leadTimeDays], i) => ({
    id: `inhouse-${i + 1}`,
    code: `PLANT-${String(i + 1).padStart(2, '0')}`,
    name,
    category,
    capacityPerMonth,
    costFactor,
    leadTimeDays,
    status: 'Active',
  }))
}

// ---------------------------------------------------------------------------
// Rate card (Price / Rate Master)
// ---------------------------------------------------------------------------

export function buildRateCard(products: Product[]): RateCard {
  return {
    baseRates: products.map((p) => ({
      productId: p.id,
      rate: p.basePrice,
      currency: 'INR',
      effectiveDate: daysAgo(180),
      expiry: daysAgo(-185),
    })),
    freightRates: [
      { region: 'North', rate: 14000, unit: 'per shipment' },
      { region: 'South', rate: 11000, unit: 'per shipment' },
      { region: 'East', rate: 18000, unit: 'per shipment' },
      { region: 'West', rate: 12500, unit: 'per shipment' },
      { region: 'Export', rate: 42000, unit: 'per shipment' },
    ],
    taxRates: [
      { taxType: 'GST (Intra-state)', rate: 18 },
      { taxType: 'IGST (Inter-state)', rate: 18 },
      { taxType: 'Export - LUT', rate: 0 },
    ],
    dutyRates: [
      { category: 'Raw Material', rate: 5 },
      { category: 'Finished Goods', rate: 7.5 },
      { category: 'Import Components', rate: 10 },
    ],
    marginRules: [
      { category: 'Drive Pulley', minMargin: 10, targetMargin: 15 },
      { category: 'Non-Drive Pulley', minMargin: 10, targetMargin: 14 },
      { category: 'Snub/Bend Pulley', minMargin: 12, targetMargin: 16 },
      { category: 'Take-up Pulley', minMargin: 12, targetMargin: 16 },
      { category: 'Wing Pulley', minMargin: 10, targetMargin: 14 },
      { category: 'Lagged Pulley', minMargin: 11, targetMargin: 15 },
    ],
  }
}

// ---------------------------------------------------------------------------
// RFQ generation engine
// ---------------------------------------------------------------------------

interface RfqConfig {
  number: string
  customerName: string
  project: string
  endCustomer?: string
  itemNames: string[]
  priority: Priority
  stage: Stage
  /** index into STAGE_ORDER up to (and NOT including) which sub-stage data is filled */
  progressLevel: number
  salesPerson: string
  createdDaysAgo: number
  marginBias?: number
  lossReason?: string
  rejectedAtOperations?: boolean
  quotationStatusOverride?: QuotationStatus
}

const RFQ_CONFIGS: RfqConfig[] = [
  {
    number: 'RFQ-2026-00124',
    customerName: 'Apex Mining Industries',
    project: 'Conveyor Expansion Project',
    endCustomer: 'Apex Mining Industries',
    itemNames: ['HT Drive Pulley', 'HT Non Drive Pulley', 'Single Drive Pulley SPL-04'],
    priority: 'Urgent',
    stage: 'Operations Review',
    progressLevel: 1,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 3,
  },
  {
    number: 'RFQ-2026-00101',
    customerName: 'Global Conveyor Systems',
    project: 'Belt Line Upgrade',
    itemNames: ['Wing Pulley WP-500'],
    priority: 'Medium',
    stage: 'Draft',
    progressLevel: 0,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 1,
  },
  {
    number: 'RFQ-2026-00102',
    customerName: 'Eastern Engineering',
    project: 'Crusher Feed System',
    itemNames: ['HT Snub Pulley', 'HT Bend Pulley'],
    priority: 'Low',
    stage: 'Draft',
    progressLevel: 0,
    salesPerson: 'Priya Nair',
    createdDaysAgo: 2,
  },
  {
    number: 'RFQ-2026-00103',
    customerName: 'Nova Cement Works',
    project: 'Kiln Feed Conveyor',
    itemNames: ['Single Drive Pulley SPL-06', 'Single Drive Pulley SPL-07'],
    priority: 'High',
    stage: 'Operations Review',
    progressLevel: 1,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 5,
  },
  {
    number: 'RFQ-2026-00104',
    customerName: 'Metro Industrial Projects',
    project: 'Stacker Reclaimer Retrofit',
    itemNames: ['HT Take-up Pulley'],
    priority: 'Medium',
    stage: 'Sourcing',
    progressLevel: 2,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 8,
  },
  {
    number: 'RFQ-2026-00105',
    customerName: 'Apex Mining Industries',
    project: 'Overland Conveyor Phase 2',
    itemNames: ['Double Drive Pulley SPL-03', 'Rubber Lagged Drive Pulley RL-900'],
    priority: 'High',
    stage: 'Sourcing',
    progressLevel: 2,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 9,
  },
  {
    number: 'RFQ-2026-00106',
    customerName: 'Global Conveyor Systems',
    project: 'Ship Loader Upgrade',
    itemNames: ['HT Drive Pulley', 'HT Non Drive Pulley'],
    priority: 'High',
    stage: 'Controlling',
    progressLevel: 3,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 11,
  },
  {
    number: 'RFQ-2026-00107',
    customerName: 'Eastern Engineering',
    project: 'Ash Handling Conveyor',
    itemNames: ['Ceramic Lagged Head Pulley CL-1000'],
    priority: 'Medium',
    stage: 'Controlling',
    progressLevel: 3,
    salesPerson: 'Priya Nair',
    createdDaysAgo: 12,
    marginBias: -5,
  },
  {
    number: 'RFQ-2026-00108',
    customerName: 'Nova Cement Works',
    project: 'Raw Mill Conveyor Line',
    itemNames: ['Single Drive Pulley SPL-04', 'HT Snub Pulley'],
    priority: 'High',
    stage: 'Approval Pending',
    progressLevel: 4,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 14,
  },
  {
    number: 'RFQ-2026-00109',
    customerName: 'Metro Industrial Projects',
    project: 'Yard Conveyor Replacement',
    itemNames: ['Wing Pulley WP-500', 'HT Bend Pulley'],
    priority: 'Urgent',
    stage: 'Approval Pending',
    progressLevel: 4,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 15,
    marginBias: -6,
  },
  {
    number: 'RFQ-2026-00110',
    customerName: 'Apex Mining Industries',
    project: 'Crusher House Modernization',
    itemNames: ['HT Drive Pulley'],
    priority: 'Medium',
    stage: 'Approved',
    progressLevel: 5,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 18,
  },
  {
    number: 'RFQ-2026-00111',
    customerName: 'Global Conveyor Systems',
    project: 'Transfer Point Upgrade',
    itemNames: ['Single Drive Pulley SPL-06'],
    priority: 'Medium',
    stage: 'Quotation Generated',
    progressLevel: 6,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 20,
    quotationStatusOverride: 'Draft',
  },
  {
    number: 'RFQ-2026-00112',
    customerName: 'Eastern Engineering',
    project: 'Cooler Vent Conveyor',
    itemNames: ['HT Take-up Pulley', 'Double Drive Pulley SPL-03'],
    priority: 'High',
    stage: 'Quotation Sent',
    progressLevel: 7,
    salesPerson: 'Priya Nair',
    createdDaysAgo: 22,
    quotationStatusOverride: 'Viewed',
  },
  {
    number: 'RFQ-2026-00113',
    customerName: 'Nova Cement Works',
    project: 'Clinker Handling Line',
    itemNames: ['Rubber Lagged Drive Pulley RL-900'],
    priority: 'Medium',
    stage: 'Quotation Sent',
    progressLevel: 7,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 24,
    marginBias: -5,
    quotationStatusOverride: 'Negotiation',
  },
  {
    number: 'RFQ-2026-00114',
    customerName: 'Metro Industrial Projects',
    project: 'Port Conveyor Expansion',
    itemNames: ['HT Drive Pulley', 'HT Non Drive Pulley', 'Wing Pulley WP-500'],
    priority: 'High',
    stage: 'Won',
    progressLevel: 7,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 30,
  },
  {
    number: 'RFQ-2026-00115',
    customerName: 'Apex Mining Industries',
    project: 'Screening Plant Conveyor',
    itemNames: ['Single Drive Pulley SPL-07'],
    priority: 'Medium',
    stage: 'Lost',
    progressLevel: 7,
    salesPerson: 'Ananya Sharma',
    createdDaysAgo: 28,
    lossReason: 'Price',
  },
  {
    number: 'RFQ-2026-00116',
    customerName: 'Global Conveyor Systems',
    project: 'Reclaim Tunnel Conveyor',
    itemNames: ['HT Snub Pulley'],
    priority: 'Low',
    stage: 'Rejected',
    progressLevel: 0,
    salesPerson: 'Karthik Iyer',
    createdDaysAgo: 10,
    rejectedAtOperations: true,
  },
  {
    number: 'RFQ-2026-00090',
    customerName: 'Eastern Engineering',
    project: 'Legacy Conveyor Retrofit',
    itemNames: ['Ceramic Lagged Head Pulley CL-1000'],
    priority: 'Low',
    stage: 'Quotation Sent',
    progressLevel: 7,
    salesPerson: 'Priya Nair',
    createdDaysAgo: 95,
    quotationStatusOverride: 'Expired',
  },
]

const STAGE_ACTIONS: Record<string, { label: string; role: Role }> = {
  'Draft->Operations Review': { label: 'Submitted RFQ for Operations review', role: 'Sales' },
  'Operations Review->Sourcing': { label: 'Approved — technically feasible, forwarded to Sourcing', role: 'Operations' },
  'Sourcing->Controlling': { label: 'Best vendor selected, submitted to Controlling', role: 'Sourcing' },
  'Controlling->Approval Pending': { label: 'Commercial pricing calculated, submitted for approval', role: 'Controlling' },
  'Approval Pending->Approved': { label: 'Final quotation approved', role: 'Approval Panel' },
  'Approved->Quotation Generated': { label: 'Quotation generated', role: 'Sales' },
  'Quotation Generated->Quotation Sent': { label: 'Quotation sent to customer', role: 'Sales' },
}

const parseNum = (v: string | number | undefined): number => (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0)

/** Builds a full Technical Data Sheet payload for a seeded item, grounded in the product's
 * own mock spec, so every demo RFQ shows up "captured" in Pricing Tool exactly like a real one. */
function generatePulleyTechnicalData(product: Product, qty: number, itemNo: number, rng: ReturnType<typeof makeHelpers>): PulleyTechDataValues {
  const td = product.technicalData
  const shellOD = parseNum(td['Shell Outer Diameter'])
  const sizeFactor = Math.min(2, Math.max(0.5, shellOD / 700))

  const bearingPool = BRG_CATALOG.slice(20, 55) // mid-range designations — realistic bore/price for pulley duty
  const bearing = rng.pick(bearingPool)
  const sleeve = SLEEVE_CATALOG.find((s) => s.forBearing === bearing.designation) ?? rng.pick(SLEEVE_CATALOG)
  const housing = HOUSING_CATALOG.find((h) => h.forBearing === bearing.designation) ?? rng.pick(HOUSING_CATALOG)
  const lagging = rng.pick(LAGGING_CATALOG)
  const lockingDevice = rng.pick(LOCKING_DEVICE_CATALOG)
  const shaftMaterial = String(td['Shaft Material'] ?? '').replace(' forged', '').trim() || '42CrMo4+QT'

  const values: PulleyTechDataValues = {
    quoteReference: product.code,
    pulleyTag: `pulley_${itemNo}`,
    pulleyStructure: 'live shaft pulley',
    qty,

    shellOD,
    shellFaceWidth: parseNum(td['Shell Face Width']),
    shellRawThickness: parseNum(td['Shell Thickness']) || 30,
    sheetWidth: parseNum(td['Sheet Width']) || parseNum(td['Shell Face Width']),
    overallDiaWithLagging: parseNum(td['Overall Pulley Diameter']),
    bearingHousingDistance: parseNum(td['Housing Distance']),
    totalPulleyMass: parseNum(td['Total Pulley Mass']),
    shellRatePerKg: PULLEY_COST_RATES.rawForgingRates.shellPlateInrPerKg,

    hubType: String(td['Hub Type'] ?? 'Welded-in hub'),
    hubWidth: parseNum(td['Hub Width']),
    hubMinOD: parseNum(td['Hub Outer Diameter']),
    hubID: parseNum(td['Hub Inner Diameter']),
    endDiskRatePerKg: PULLEY_COST_RATES.rawForgingRates.endDiscInrPerKg,

    shaftLength: parseNum(td['Shaft Length']),
    shaftDiameter: parseNum(td['Shaft Centre Diameter']),
    shaftMaterial,
    shaftRatePerKg: shaftMaterial === '42CrMo4+QT' ? PULLEY_COST_RATES.rawForgingRates.shaft42CrMo4InrPerKg : PULLEY_COST_RATES.rawForgingRates.shaftC45InrPerKg,

    bearing1Designation: bearing.designation,
    bearing1Price: bearing.priceInr,
    bearing2Designation: bearing.designation,
    bearing2Price: bearing.priceInr,
    sleeveCode: sleeve.sleeveCode,
    sleevePrice: sleeve.priceInr,
    housingDesignation: housing.housingDesignation,
    housingPrice: housing.priceInr,

    laggingType: lagging.laggingType,
    laggingThickness: lagging.thicknessMm,
    laggingRate: lagging.priceInrPerM2,

    lockingDeviceType: lockingDevice.model,
    lockingDevicePrice: lockingDevice.negotiatedRateInr,
    deadShaftParts: Math.round(rng.randFloat(8000, 25000)),

    srcRollingBending: 'In-house',
    srcWelding: 'In-house',
    srcStressRelief: 'Outsource',
    srcMachining: 'In-house',
    srcLagging: 'Outsource',
    srcBalancing: 'In-house',
    srcPainting: 'In-house',

    c1RunMin: Math.round(120 * sizeFactor),
    c1SetupMin: 30,
    c2RunMin: Math.round(200 * sizeFactor),
    c2SetupMin: 45,
    c3RunMin: Math.round(150 * sizeFactor),
    c3SetupMin: 40,
    c4RunMin: Math.round(100 * sizeFactor),
    c4SetupMin: 20,
    c5RunMin: Math.round(60 * sizeFactor),
    c5SetupMin: 15,
    c6RunMin: Math.round(80 * sizeFactor),
    c6SetupMin: 15,
    c7RunMin: Math.round(90 * sizeFactor),
    c7SetupMin: 20,
  }

  return { ...values, ...computeAutoFields(values) }
}

function buildItems(rng: ReturnType<typeof makeHelpers>, products: Product[], names: string[], rfqNumber: string, receivedIso: string): RFQItem[] {
  return names.map((name, i) => {
    const product = products.find((p) => p.name === name)!
    const qty = rng.randInt(1, 4)
    const requiredDelivery = new Date(new Date(receivedIso).getTime() + rng.randInt(35, 70) * 86400000).toISOString()
    const technicalData = generatePulleyTechnicalData(product, qty, i + 1, rng)
    return {
      id: `${rfqNumber}-item-${i + 1}`,
      itemNo: i + 1,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      description: product.description,
      quantity: qty,
      unit: product.unit,
      specification: `${product.technicalData['Overall Pulley Diameter'] ?? product.technicalData['Shell Outer Diameter']} dia, ${product.technicalData['Shaft Material']}`,
      requiredDelivery,
      targetPrice: Math.round(product.basePrice * rng.randFloat(0.85, 1.05)),
      remarks: '',
      technicalData,
    }
  })
}

function marginRuleFor(rateCard: RateCard, category: string) {
  return rateCard.marginRules.find((m) => m.category === category) ?? { minMargin: 10, targetMargin: 15 }
}

function buildRfq(
  config: RfqConfig,
  products: Product[],
  customers: Customer[],
  vendors: Vendor[],
  rateCard: RateCard,
): { rfq: RFQ; audit: AuditEvent[]; notifications: AppNotification[] } {
  const rng = makeHelpers(hashString(config.number))
  const customer = customers.find((c) => c.name === config.customerName)!
  const receivedIso = daysAgo(config.createdDaysAgo)
  const items = buildItems(rng, products, config.itemNames, config.number, receivedIso)
  const rfqId = config.number.toLowerCase()

  const primaryCategory = products.find((p) => p.name === config.itemNames[0])!.category
  const marginRule = marginRuleFor(rateCard, primaryCategory)
  const targetMarginPercent = marginRule.targetMargin

  let operationsReview: RFQ['operationsReview']
  let costBreakdown: CostBreakdownLine[] = []

  const pastStage = (idx: number) => config.progressLevel > idx

  if (config.rejectedAtOperations) {
    operationsReview = {
      technicalFeasibility: 'Not Feasible',
      delivery: 'Not available',
      commercialReview: 'Requires clarification',
      notes: 'Shell dimensions conflict with existing pulley shaft centre distance. Customer drawings requested but not viable within timeline.',
    }
  } else if (pastStage(0)) {
    operationsReview = {
      technicalFeasibility: 'Feasible',
      delivery: 'Available',
      commercialReview: 'Acceptable',
      notes: 'Specifications verified against standard range. Stock/lead time confirmed with production planning.',
    }
  }

  if (pastStage(1)) {
    // Sourcing has reviewed every component/process (already captured in item.technicalData
    // by generatePulleyTechnicalData) and tagged the outsourced ones with a vendor.
    items.forEach((item) => {
      item.sourcingConfirmed = true
      const outsourcedProcesses = ['srcStressRelief', 'srcLagging'] as const
      item.processVendors = outsourcedProcesses
        .filter((key) => item.technicalData?.[key] === 'Outsource')
        .map((key) => {
          const v = rng.pick(vendors)
          return { processKey: key, vendorId: v.id, vendorName: v.name }
        })
    })
  }

  if (pastStage(2)) {
    costBreakdown = items.map((item) => {
      const pricing = computePulleyPricing(item.technicalData ?? {})
      const baseCost = pricing.totalDirectCost
      const freight = Math.round(baseCost * 0.02)
      const duties = Math.round(baseCost * 0.05)
      const otherCharges = Math.round(baseCost * 0.01)
      const discount = Math.round(baseCost * 0.015)
      const margin = Math.max(4, targetMarginPercent + (config.marginBias ?? 0) + rng.randFloat(-1.5, 1.5))
      return calculateCostBreakdown({
        itemId: item.id,
        baseCost,
        freight,
        duties,
        otherCharges,
        discount,
        marginPercent: margin,
        taxPercent: 18,
      })
    })
  }

  const value = costBreakdown.length > 0
    ? costBreakdown.reduce((s, l) => s + l.finalPrice, 0)
    : items.reduce((s, i) => s + i.targetPrice * i.quantity, 0)

  const rfq: RFQ = {
    id: rfqId,
    rfqNumber: config.number,
    customerId: customer.id,
    customerCode: customer.code,
    contactPerson: customer.contact,
    contactEmail: customer.email,
    contactPhone: customer.phone,
    customerReference: `${customer.code}-REF-${config.number.slice(-3)}`,
    rfqReceivedDate: receivedIso,
    projectName: config.project,
    projectCode: `PRJ-${config.number.slice(-5)}`,
    quoteReference: `QR-${config.number.slice(-5)}`,
    endCustomer: config.endCustomer ?? customer.name,
    location: customer.city,
    industry: 'Mining & Materials Handling',
    requiredDeliveryDate: items[0]?.requiredDelivery ?? daysAgo(-45),
    priority: config.priority,
    currency: 'INR',
    paymentTerms: customer.paymentTerms,
    deliveryTerms: 'Ex-works + freight',
    quotationValidity: '30 days',
    incoterms: 'FOR Destination',
    taxApplicability: 'GST Applicable',
    freightRequirement: 'To be arranged by supplier',
    customerRemarks: '',
    items,
    attachments: rng.rand() > 0.5 ? [{ id: `${rfqId}-att-1`, name: 'Customer_RFQ_Drawing.pdf' }] : [],
    internalNotes: '',
    customerNotes: '',
    stage: config.stage,
    status: config.stage,
    salesPerson: config.salesPerson,
    createdAt: receivedIso,
    updatedAt: daysAgo(Math.max(0, config.createdDaysAgo - config.progressLevel)),
    value,
    operationsReview,
    sourcingComments: pastStage(1) ? 'All components and processes reviewed — in-house/outsource split confirmed per item.' : undefined,
    costBreakdown,
    targetMarginPercent,
    lossReason: config.lossReason,
  }

  const { audit, notifications } = buildHistory(rfq, config)
  return { rfq, audit, notifications }
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

function buildHistory(rfq: RFQ, config: RfqConfig): { audit: AuditEvent[]; notifications: AppNotification[] } {
  const audit: AuditEvent[] = []
  const notifications: AppNotification[] = []
  const totalSpan = Math.max(1, config.createdDaysAgo)
  let step = 0

  const push = (label: string, role: Role, prev: Stage | undefined, next: Stage, comment?: string) => {
    step += 1
    const ts = daysAgo(Math.max(0, totalSpan - step * (totalSpan / 8)))
    audit.push({
      id: `${rfq.id}-audit-${step}`,
      rfqId: rfq.id,
      timestamp: ts,
      user: role === 'Sales' ? rfq.salesPerson : DEMO_PERSONA[role].name,
      role,
      module: 'RFQ',
      record: rfq.rfqNumber,
      action: label,
      previousStatus: prev,
      newStatus: next,
      comment,
    })
  }

  push('Created RFQ', 'Sales', undefined, 'Draft')

  const order: Stage[] = STAGE_ORDER
  const currentIdx = order.indexOf(rfq.stage)

  if (config.rejectedAtOperations) {
    push('Rejected RFQ — not technically feasible', 'Operations', 'Draft', 'Rejected', 'Shell/shaft dimensions conflict with existing installation. Please re-check with customer.')
    notifications.push(mkNotif(rfq, `${rfq.rfqNumber} was rejected by Operations.`, 'error', 'Sales'))
    return { audit, notifications }
  }

  if (currentIdx > 0 || rfq.stage === 'Won' || rfq.stage === 'Lost') {
    const stopIdx = currentIdx >= 0 ? currentIdx : order.length
    for (let i = 0; i < stopIdx; i++) {
      const key = `${order[i]}->${order[i + 1]}`
      const action = STAGE_ACTIONS[key]
      if (action) push(action.label, action.role, order[i], order[i + 1])
    }
  }

  if (rfq.stage === 'Won') {
    push('Marked as Won', 'Sales', 'Quotation Sent', 'Won')
    notifications.push(mkNotif(rfq, `Quotation for ${rfq.rfqNumber} was marked Won.`, 'success', 'Sales'))
  } else if (rfq.stage === 'Lost') {
    push('Marked as Lost', 'Sales', 'Quotation Sent', 'Lost', `Loss reason: ${config.lossReason ?? 'Other'}`)
    notifications.push(mkNotif(rfq, `Quotation for ${rfq.rfqNumber} was marked Lost.`, 'warning', 'Sales'))
  } else {
    const owner = STAGE_OWNER_FOR_NOTIFICATION[rfq.stage]
    if (owner) {
      notifications.push(mkNotif(rfq, notificationMessageFor(rfq), 'info', owner))
    }
  }

  return { audit, notifications }
}

const STAGE_OWNER_FOR_NOTIFICATION: Partial<Record<Stage, Role>> = {
  'Operations Review': 'Operations',
  Sourcing: 'Sourcing',
  Controlling: 'Controlling',
  'Approval Pending': 'Approval Panel',
  Approved: 'Sales',
  'Quotation Generated': 'Sales',
  'Quotation Sent': 'Sales',
}

function notificationMessageFor(rfq: RFQ): string {
  switch (rfq.stage) {
    case 'Operations Review':
      return `${rfq.rfqNumber} has been submitted for Operations review.`
    case 'Sourcing':
      return `${rfq.rfqNumber} is awaiting vendor sourcing.`
    case 'Controlling':
      return `${rfq.rfqNumber} is awaiting commercial pricing.`
    case 'Approval Pending':
      return `Quotation for ${rfq.rfqNumber} is awaiting final approval.`
    case 'Approved':
      return `${rfq.rfqNumber} was approved — ready to generate quotation.`
    case 'Quotation Generated':
      return `Quotation generated for ${rfq.rfqNumber} — ready to send.`
    case 'Quotation Sent':
      return `Quotation for ${rfq.rfqNumber} was sent to the customer.`
    default:
      return `${rfq.rfqNumber} was updated.`
  }
}

function mkNotif(rfq: RFQ, message: string, kind: AppNotification['kind'], role: Role): AppNotification {
  return {
    id: `notif-${rfq.id}`,
    message,
    timestamp: rfq.updatedAt,
    read: hashString(rfq.id) % 3 === 0,
    kind,
    rfqId: rfq.id,
    targetRole: role,
  }
}

// ---------------------------------------------------------------------------
// Quotations derived from RFQs
// ---------------------------------------------------------------------------

function deriveQuotation(rfq: RFQ, config: RfqConfig, seq: number): Quotation | undefined {
  const eligible: Stage[] = ['Quotation Generated', 'Quotation Sent', 'Won', 'Lost']
  if (!eligible.includes(rfq.stage)) return undefined

  let status: QuotationStatus = 'Sent'
  if (config.quotationStatusOverride) status = config.quotationStatusOverride
  else if (rfq.stage === 'Won') status = 'Won'
  else if (rfq.stage === 'Lost') status = 'Lost'
  else if (rfq.stage === 'Quotation Generated') status = 'Draft'

  return {
    id: `quo-${rfq.id}`,
    quotationNumber: `Q-2026-${String(1000 + seq).slice(-4)}`,
    rfqId: rfq.id,
    rfqNumber: rfq.rfqNumber,
    customerId: rfq.customerId,
    customerName: rfq.endCustomer,
    projectName: rfq.projectName,
    quoteDate: rfq.updatedAt,
    validUntil: new Date(new Date(rfq.updatedAt).getTime() + 30 * 86400000).toISOString(),
    currency: rfq.currency,
    amount: rfq.value,
    marginPercent: rfq.costBreakdown.length
      ? rfq.costBreakdown.reduce((s, l) => s + l.marginPercent, 0) / rfq.costBreakdown.length
      : rfq.targetMarginPercent,
    status,
    salesPerson: rfq.salesPerson,
    lossReason: rfq.lossReason,
  }
}

// ---------------------------------------------------------------------------
// Top-level seed builder
// ---------------------------------------------------------------------------

export interface SeedData {
  users: User[]
  customers: Customer[]
  vendors: Vendor[]
  inHouseCapabilities: InHouseCapability[]
  products: Product[]
  rateCard: RateCard
  rfqs: RFQ[]
  quotations: Quotation[]
  auditLog: AuditEvent[]
  notifications: AppNotification[]
}

export function createSeedData(): SeedData {
  const users = buildUsers()
  const customers = buildCustomers()
  const vendors = buildVendors()
  const inHouseCapabilities = buildInHouseCapabilities()
  const products = buildProducts()
  const rateCard = buildRateCard(products)

  const rfqs: RFQ[] = []
  const auditLog: AuditEvent[] = []
  const notifications: AppNotification[] = []
  const quotations: Quotation[] = []

  RFQ_CONFIGS.forEach((config, i) => {
    const { rfq, audit, notifications: notifs } = buildRfq(config, products, customers, vendors, rateCard)
    rfqs.push(rfq)
    auditLog.push(...audit)
    notifications.push(...notifs)
    const quotation = deriveQuotation(rfq, config, i + 1)
    if (quotation) quotations.push(quotation)
  })

  auditLog.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return { users, customers, vendors, inHouseCapabilities, products, rateCard, rfqs, quotations, auditLog, notifications }
}
