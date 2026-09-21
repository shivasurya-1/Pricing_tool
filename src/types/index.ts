export type Role =
  | 'Sales'
  | 'Operations'
  | 'Sourcing'
  | 'Controlling'
  | 'Approval Panel'
  | 'Admin'

export const ROLES: Role[] = [
  'Sales',
  'Operations',
  'Sourcing',
  'Controlling',
  'Approval Panel',
  'Admin',
]

export type Stage =
  | 'Draft'
  | 'Operations Review'
  | 'Sourcing'
  | 'Controlling'
  | 'Approval Pending'
  | 'Approved'
  | 'Quotation Generated'
  | 'Quotation Sent'
  | 'Won'
  | 'Lost'
  | 'Rejected'

export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  department: string
  status: 'Active' | 'Inactive'
  lastLogin: string
  avatarColor: string
}

export interface Customer {
  id: string
  code: string
  name: string
  contact: string
  email: string
  phone: string
  city: string
  taxId: string
  paymentTerms: string
  status: 'Active' | 'Inactive'
  updatedAt: string
}

export interface Vendor {
  id: string
  code: string
  name: string
  category: string
  contact: string
  email: string
  rating: number
  paymentTerms: string
  status: 'Active' | 'Inactive'
}

export interface ProductTechnicalData {
  [field: string]: string | number
}

/** Whether a product can be produced internally, must be bought out, or either. */
export type SourcingType = 'In-House' | 'Out-House' | 'Both'

export interface Product {
  id: string
  code: string
  name: string
  category: string
  unit: string
  description: string
  defaultLeadTimeDays: number
  basePrice: number
  status: 'Active' | 'Inactive'
  technicalData: ProductTechnicalData
  preferredVendorIds: string[]
  sourcingType: SourcingType
}

/** Internal production line/plant — the "in-house" counterpart to the Vendor master. */
export interface InHouseCapability {
  id: string
  code: string
  name: string
  category: string
  capacityPerMonth: number
  /** Typical in-house cost as a fraction of the item's reference price (e.g. 0.9 = 90%). */
  costFactor: number
  leadTimeDays: number
  status: 'Active' | 'Inactive'
}

export interface RateCard {
  baseRates: { productId: string; rate: number; currency: string; effectiveDate: string; expiry: string }[]
  freightRates: { region: string; rate: number; unit: string }[]
  taxRates: { taxType: string; rate: number }[]
  dutyRates: { category: string; rate: number }[]
  marginRules: { category: string; minMargin: number; targetMargin: number }[]
}

/** A pulley Technical Data Sheet capture — one entry per parameter, keyed by field id (see pulleyTechDataSchema). */
export type PulleyTechDataValues = Record<string, string | number | undefined>

export interface RFQItem {
  id: string
  itemNo: number
  productId: string
  productCode: string
  productName: string
  description: string
  quantity: number
  unit: string
  specification: string
  requiredDelivery: string
  targetPrice: number
  remarks: string
  /** Full customer technical spec captured from the Technical Data Sheet, if filled. */
  technicalData?: PulleyTechDataValues
  /** Set once Sourcing has reviewed every component/process for this item. */
  sourcingConfirmed?: boolean
  /** Optional vendor tag Sourcing can attach to an outsourced component or process — cost still comes from computePulleyPricing(), this is informational only. */
  processVendors?: ProcessVendorAssignment[]
}

export interface ProcessVendorAssignment {
  processKey: string
  vendorId: string
  vendorName: string
}

export interface CostBreakdownLine {
  itemId: string
  baseCost: number
  freight: number
  duties: number
  otherCharges: number
  discount: number
  adjustedCost: number
  marginPercent: number
  marginValue: number
  sellingPrice: number
  taxPercent: number
  taxValue: number
  finalPrice: number
}

export interface AuditEvent {
  id: string
  rfqId: string
  timestamp: string
  user: string
  role: Role
  module: string
  record: string
  action: string
  previousStatus?: Stage
  newStatus?: Stage
  comment?: string
}

export type NotificationKind = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: string
  message: string
  timestamp: string
  read: boolean
  kind: NotificationKind
  rfqId?: string
  quotationId?: string
  targetRole?: Role
}

export interface OperationsReview {
  technicalFeasibility?: 'Feasible' | 'Feasible with Conditions' | 'Not Feasible'
  delivery?: 'Available' | 'Partial' | 'Need sourcing' | 'Not available'
  commercialReview?: 'Acceptable' | 'Requires clarification'
  notes?: string
}

export interface RFQAttachment {
  id: string
  name: string
  contentType: string
  sizeBytes: number
  uploadedByName: string
  uploadedAt: string
}

export interface RFQ {
  id: string
  rfqNumber: string
  customerId: string
  customerCode: string
  contactPerson: string
  contactEmail: string
  contactPhone: string
  customerReference: string
  rfqReceivedDate: string

  projectName: string
  projectCode: string
  quoteReference: string
  endCustomer: string
  location: string
  industry: string
  requiredDeliveryDate: string
  priority: Priority

  currency: string
  paymentTerms: string
  deliveryTerms: string
  quotationValidity: string
  incoterms: string
  taxApplicability: string
  freightRequirement: string
  customerRemarks: string

  items: RFQItem[]
  attachments: RFQAttachment[]
  internalNotes: string
  customerNotes: string

  stage: Stage
  status: string
  salesPerson: string
  createdAt: string
  updatedAt: string
  value: number

  operationsReview?: OperationsReview
  sourcingComments?: string
  costBreakdown: CostBreakdownLine[]
  targetMarginPercent: number

  lossReason?: string
}

export type QuotationStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Sent'
  | 'Viewed'
  | 'Negotiation'
  | 'Won'
  | 'Lost'
  | 'Expired'

export interface Quotation {
  id: string
  quotationNumber: string
  rfqId: string
  rfqNumber: string
  customerId: string
  customerName: string
  projectName: string
  quoteDate: string
  validUntil: string
  currency: string
  amount: number
  marginPercent: number
  status: QuotationStatus
  salesPerson: string
  lossReason?: string
}

export interface Task {
  id: string
  title: string
  rfqId: string
  rfqNumber: string
  customerName: string
  stage: Stage
  priority: Priority
  dueDate: string
  createdAt: string
  role: Role
  action: string
}
