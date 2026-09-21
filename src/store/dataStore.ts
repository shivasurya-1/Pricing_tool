import { create } from 'zustand'
import type {
  AppNotification,
  AuditEvent,
  CostBreakdownLine,
  Customer,
  InHouseCapability,
  OperationsReview,
  Product,
  Quotation,
  QuotationStatus,
  RFQ,
  RFQItem,
  Role,
  Stage,
  User,
  Vendor,
} from '@/types'
import { buildInHouseCapabilities, buildUsers } from '@/data/mockSeed'
import { applyFieldChange } from '@/lib/pulleyTechDataCalc'
import { api, ApiError } from '@/lib/apiClient'
import { useUiStore } from '@/store/uiStore'

/**
 * RFQs, Quotations, Customers, Vendors, Products, the audit log, and notifications are
 * now real, shared backend data (see /backend/rfq) instead of per-browser localStorage —
 * every action here calls the Django API and refreshes in-memory state from its
 * response. `users`, `inHouseCapabilities` have no backend model (out of scope for this
 * migration) and stay as static prototype data, same as before.
 */

export interface NewRFQInput {
  customerId: string
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
  priority: RFQ['priority']
  currency: string
  paymentTerms: string
  deliveryTerms: string
  quotationValidity: string
  incoterms: string
  taxApplicability: string
  freightRequirement: string
  customerRemarks: string
  items: Omit<RFQItem, 'id' | 'itemNo'>[]
  internalNotes: string
  customerNotes: string
}

interface DataState {
  // Static prototype data — no backend model exists for these (out of scope).
  users: User[]
  inHouseCapabilities: InHouseCapability[]

  // Backend-driven — see loadAll().
  loaded: boolean
  loading: boolean
  customers: Customer[]
  vendors: Vendor[]
  products: Product[]
  rfqs: RFQ[]
  quotations: Quotation[]
  auditLog: AuditEvent[]
  notifications: AppNotification[]

  loadAll: () => Promise<void>
  resetDemoData: () => void

  createRFQ: (input: NewRFQInput, actorName: string, submit: boolean) => Promise<RFQ>
  submitRFQ: (id: string, actorName: string) => Promise<void>
  uploadRfqAttachment: (id: string, file: File) => Promise<void>
  deleteRfqAttachment: (id: string, attachmentId: string) => Promise<void>

  saveOperationsReview: (id: string, review: OperationsReview) => Promise<void>
  approveOperations: (id: string, actorName: string) => Promise<void>

  updateItemTechData: (id: string, itemId: string, fieldKey: string, value: string | number) => Promise<void>
  confirmItemSourcing: (id: string, itemId: string, confirmed: boolean) => Promise<void>
  assignProcessVendor: (id: string, itemId: string, processKey: string, vendorId: string, vendorName: string) => Promise<void>
  saveSourcingComment: (id: string, comment: string) => Promise<void>
  submitSourcing: (id: string, actorName: string) => Promise<void>

  saveCostBreakdown: (id: string, lines: CostBreakdownLine[]) => Promise<void>
  submitControlling: (id: string, actorName: string) => Promise<void>

  approveFinal: (id: string, actorName: string, comment?: string) => Promise<void>
  sendBack: (id: string, targetStage: Stage, actorRole: Role, actorName: string, comment: string) => Promise<void>
  rejectRFQ: (id: string, actorRole: Role, actorName: string, reason: string, comment: string) => Promise<void>

  generateQuotation: (id: string, actorName: string) => Promise<Quotation>
  sendQuotation: (id: string, actorName: string) => Promise<void>
  sendQuotationEmail: (quotationId: string, actorName: string) => Promise<void>
  updateQuotationStatus: (quotationId: string, status: QuotationStatus, actorName: string, lossReason?: string) => Promise<void>

  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>

  upsertCustomer: (c: Customer) => Promise<void>
  upsertVendor: (v: Vendor) => Promise<void>
  upsertProduct: (p: Product) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
}

/** Every mutating action runs through this so a failed request surfaces a toast even
 * when the call site doesn't await/catch (most don't — they fire-and-forget the way
 * the old synchronous actions did). Rethrows so callers that DO await (createRFQ,
 * generateQuotation) still see the failure and can skip navigating on error. */
async function withErrorToast<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Something went wrong — please try again.'
    useUiStore.getState().pushToast(message, 'error')
    throw err
  }
}

function replaceRfq(rfqs: RFQ[], updated: RFQ): RFQ[] {
  return rfqs.map((r) => (r.id === updated.id ? updated : r))
}

export const useDataStore = create<DataState>()((set, get) => ({
  users: buildUsers(),
  inHouseCapabilities: buildInHouseCapabilities(),

  loaded: false,
  loading: false,
  customers: [],
  vendors: [],
  products: [],
  rfqs: [],
  quotations: [],
  auditLog: [],
  notifications: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [customers, vendors, products, rfqs, quotations, auditLog, notifications] = await Promise.all([
        api.get<Customer[]>('/rfq/customers/'),
        api.get<Vendor[]>('/rfq/vendors/'),
        api.get<Product[]>('/rfq/products/'),
        api.get<RFQ[]>('/rfq/rfqs/'),
        api.get<Quotation[]>('/rfq/quotations/'),
        api.get<AuditEvent[]>('/rfq/audit-log/'),
        api.get<AppNotification[]>('/rfq/notifications/'),
      ])
      set({ customers, vendors, products, rfqs, quotations, auditLog, notifications, loaded: true, loading: false })
    } catch {
      // Backend not running/deployed — leave `loaded: false`. There is deliberately no
      // local fallback here (unlike formulaStore): RFQ/customer/vendor data is shared,
      // multi-user state, so fabricating local mock data on failure would just recreate
      // the "two browsers, two realities" problem this migration exists to fix.
      useUiStore.getState().pushToast('Could not reach the server — RFQ data may be out of date.', 'error')
      set({ loading: false })
    }
  },

  resetDemoData: () => {
    set({ users: buildUsers(), inHouseCapabilities: buildInHouseCapabilities() })
    get().loadAll()
  },

  createRFQ: (input, actorName, submit) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>('/rfq/rfqs/', { ...input, actorName, submit })
      set((s) => ({ rfqs: [rfq, ...s.rfqs] }))
      return rfq
    }),

  submitRFQ: (id, actorName) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/submit/`, { actorName })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  uploadRfqAttachment: (id, file) =>
    withErrorToast(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const rfq = await api.postForm<RFQ>(`/rfq/rfqs/${id}/attachments/`, formData)
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),
  deleteRfqAttachment: (id, attachmentId) =>
    withErrorToast(async () => {
      const rfq = await api.delete<RFQ>(`/rfq/rfqs/${id}/attachments/${attachmentId}/`)
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  saveOperationsReview: (id, review) =>
    withErrorToast(async () => {
      const rfq = await api.patch<RFQ>(`/rfq/rfqs/${id}/operations-review/`, { review })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  approveOperations: (id, actorName) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/approve-operations/`, { actorName })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  updateItemTechData: (id, itemId, fieldKey, value) =>
    withErrorToast(async () => {
      const current = get().rfqs.find((r) => r.id === id)?.items.find((it) => it.id === itemId)
      const technicalData = applyFieldChange(current?.technicalData ?? {}, fieldKey, value)
      const rfq = await api.patch<RFQ>(`/rfq/rfqs/${id}/item-tech-data/`, { itemId, technicalData })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  confirmItemSourcing: (id, itemId, confirmed) =>
    withErrorToast(async () => {
      const rfq = await api.patch<RFQ>(`/rfq/rfqs/${id}/item-sourcing-confirmed/`, { itemId, confirmed })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  assignProcessVendor: (id, itemId, processKey, vendorId, vendorName) =>
    withErrorToast(async () => {
      const rfq = await api.patch<RFQ>(`/rfq/rfqs/${id}/item-process-vendor/`, { itemId, processKey, vendorId, vendorName })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  saveSourcingComment: (id, comment) =>
    withErrorToast(async () => {
      const rfq = await api.patch<RFQ>(`/rfq/rfqs/${id}/sourcing-comment/`, { comment })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  submitSourcing: (id, actorName) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/submit-sourcing/`, { actorName })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  saveCostBreakdown: (id, lines) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/cost-breakdown/`, { lines })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  submitControlling: (id, actorName) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/submit-controlling/`, { actorName })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  approveFinal: (id, actorName, comment) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/approve-final/`, { actorName, comment })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  sendBack: (id, targetStage, actorRole, actorName, comment) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/send-back/`, { targetStage, actorRole, actorName, comment })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  rejectRFQ: (id, actorRole, actorName, reason, comment) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/reject/`, { actorRole, actorName, reason, comment })
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq) }))
    }),

  generateQuotation: (id, actorName) =>
    withErrorToast(async () => {
      const quotation = await api.post<Quotation>(`/rfq/rfqs/${id}/generate-quotation/`, { actorName })
      const rfq = await api.get<RFQ>(`/rfq/rfqs/${id}/`)
      set((s) => ({ rfqs: replaceRfq(s.rfqs, rfq), quotations: [quotation, ...s.quotations] }))
      return quotation
    }),

  sendQuotation: (id, actorName) =>
    withErrorToast(async () => {
      const rfq = await api.post<RFQ>(`/rfq/rfqs/${id}/send-quotation/`, { actorName })
      set((s) => ({
        rfqs: replaceRfq(s.rfqs, rfq),
        quotations: s.quotations.map((q) => (q.rfqId === id ? { ...q, status: 'Sent' as QuotationStatus } : q)),
      }))
    }),

  sendQuotationEmail: (quotationId, actorName) =>
    withErrorToast(async () => {
      const quotation = await api.post<Quotation>(`/rfq/quotations/${quotationId}/send-email/`, { actorName })
      set((s) => ({ quotations: s.quotations.map((q) => (q.id === quotationId ? quotation : q)) }))
    }),

  updateQuotationStatus: (quotationId, status, actorName, lossReason) =>
    withErrorToast(async () => {
      const quotation = await api.patch<Quotation>(`/rfq/quotations/${quotationId}/status/`, { status, actorName, lossReason })
      const rfq = await api.get<RFQ>(`/rfq/rfqs/${quotation.rfqId}/`)
      set((s) => ({
        quotations: s.quotations.map((q) => (q.id === quotationId ? quotation : q)),
        rfqs: replaceRfq(s.rfqs, rfq),
      }))
    }),

  markNotificationRead: (id) =>
    withErrorToast(async () => {
      const notif = await api.patch<AppNotification>(`/rfq/notifications/${id}/read/`, {})
      set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? notif : n)) }))
    }),

  markAllNotificationsRead: () =>
    withErrorToast(async () => {
      await api.post(`/rfq/notifications/mark-all-read/`, {})
      set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
    }),

  upsertCustomer: (c) =>
    withErrorToast(async () => {
      const isNew = !c.id
      const saved = isNew
        ? await api.post<Customer>('/rfq/customers/', c)
        : await api.patch<Customer>(`/rfq/customers/${c.id}/`, c)
      set((s) => ({
        customers: isNew ? [saved, ...s.customers] : s.customers.map((x) => (x.id === saved.id ? saved : x)),
      }))
    }),

  upsertVendor: (v) =>
    withErrorToast(async () => {
      const isNew = !v.id
      const saved = isNew ? await api.post<Vendor>('/rfq/vendors/', v) : await api.patch<Vendor>(`/rfq/vendors/${v.id}/`, v)
      set((s) => ({
        vendors: isNew ? [saved, ...s.vendors] : s.vendors.map((x) => (x.id === saved.id ? saved : x)),
      }))
    }),

  upsertProduct: (p) =>
    withErrorToast(async () => {
      const isNew = !p.id
      const saved = isNew ? await api.post<Product>('/rfq/products/', p) : await api.patch<Product>(`/rfq/products/${p.id}/`, p)
      set((s) => ({
        products: isNew ? [saved, ...s.products] : s.products.map((x) => (x.id === saved.id ? saved : x)),
      }))
    }),
  deleteProduct: (id) =>
    withErrorToast(async () => {
      await api.delete(`/rfq/products/${id}/`)
      set((s) => ({ products: s.products.filter((x) => x.id !== id) }))
    }),
}))
