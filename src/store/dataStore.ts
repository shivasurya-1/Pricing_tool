import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  RateCard,
  RFQ,
  RFQItem,
  Role,
  Stage,
  User,
  Vendor,
} from '@/types'
import { createSeedData } from '@/data/mockSeed'
import { NEXT_STAGE, STAGE_OWNER } from '@/lib/workflow'
import { nextQuotationNumber, nextRfqNumber, uid } from '@/lib/id'
import { applyFieldChange } from '@/lib/pulleyTechDataCalc'

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

  resetDemoData: () => void

  createRFQ: (input: NewRFQInput, actorName: string, submit: boolean) => RFQ
  updateRFQ: (id: string, patch: Partial<RFQ>) => void
  submitRFQ: (id: string, actorName: string) => void

  saveOperationsReview: (id: string, review: OperationsReview) => void
  approveOperations: (id: string, actorName: string) => void

  updateItemTechData: (id: string, itemId: string, fieldKey: string, value: string | number) => void
  confirmItemSourcing: (id: string, itemId: string, confirmed: boolean) => void
  assignProcessVendor: (id: string, itemId: string, processKey: string, vendorId: string, vendorName: string) => void
  saveSourcingComment: (id: string, comment: string) => void
  submitSourcing: (id: string, actorName: string) => void

  saveCostBreakdown: (id: string, lines: CostBreakdownLine[]) => void
  submitControlling: (id: string, actorName: string) => void

  approveFinal: (id: string, actorName: string, comment?: string) => void
  sendBack: (id: string, targetStage: Stage, actorRole: Role, actorName: string, comment: string) => void
  rejectRFQ: (id: string, actorRole: Role, actorName: string, reason: string, comment: string) => void

  generateQuotation: (id: string, actorName: string) => Quotation
  sendQuotation: (id: string, actorName: string) => void
  updateQuotationStatus: (quotationId: string, status: QuotationStatus, actorName: string, lossReason?: string) => void

  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void

  upsertCustomer: (c: Customer) => void
  upsertVendor: (v: Vendor) => void
  upsertProduct: (p: Product) => void
}

function appendAudit(
  state: Pick<DataState, 'auditLog'>,
  entry: Omit<AuditEvent, 'id' | 'timestamp'>,
): AuditEvent {
  const event: AuditEvent = { ...entry, id: uid('audit'), timestamp: new Date().toISOString() }
  state.auditLog.unshift(event)
  return event
}

function appendNotification(
  state: Pick<DataState, 'notifications'>,
  message: string,
  kind: AppNotification['kind'],
  targetRole: Role | undefined,
  rfqId?: string,
  quotationId?: string,
): void {
  state.notifications.unshift({
    id: uid('notif'),
    message,
    timestamp: new Date().toISOString(),
    read: false,
    kind,
    rfqId,
    quotationId,
    targetRole,
  })
}

function touch(rfq: RFQ): RFQ {
  return { ...rfq, updatedAt: new Date().toISOString() }
}

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      ...createSeedData(),

      resetDemoData: () => set({ ...createSeedData() }),

      createRFQ: (input, actorName, submit) => {
        const state = get()
        const customer = state.customers.find((c) => c.id === input.customerId)!
        const rfqNumber = nextRfqNumber(state.rfqs.map((r) => r.rfqNumber))
        const now = new Date().toISOString()
        const stage: Stage = submit ? 'Operations Review' : 'Draft'
        const rfq: RFQ = {
          id: rfqNumber.toLowerCase(),
          rfqNumber,
          customerId: customer.id,
          customerCode: customer.code,
          contactPerson: input.contactPerson,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          customerReference: input.customerReference,
          rfqReceivedDate: input.rfqReceivedDate,
          projectName: input.projectName,
          projectCode: input.projectCode,
          quoteReference: input.quoteReference,
          endCustomer: input.endCustomer || customer.name,
          location: input.location,
          industry: input.industry,
          requiredDeliveryDate: input.requiredDeliveryDate,
          priority: input.priority,
          currency: input.currency,
          paymentTerms: input.paymentTerms,
          deliveryTerms: input.deliveryTerms,
          quotationValidity: input.quotationValidity,
          incoterms: input.incoterms,
          taxApplicability: input.taxApplicability,
          freightRequirement: input.freightRequirement,
          customerRemarks: input.customerRemarks,
          items: input.items.map((it, i) => ({ ...it, id: uid('item'), itemNo: i + 1 })),
          attachments: [],
          internalNotes: input.internalNotes,
          customerNotes: input.customerNotes,
          stage,
          status: stage,
          salesPerson: actorName,
          createdAt: now,
          updatedAt: now,
          value: input.items.reduce((s, it) => s + it.targetPrice * it.quantity, 0),
          costBreakdown: [],
          targetMarginPercent: 15,
        }

        set((s) => {
          const auditLog = [...s.auditLog]
          appendAudit({ auditLog }, {
            rfqId: rfq.id, user: actorName, role: 'Sales', module: 'RFQ',
            record: rfq.rfqNumber, action: 'Created RFQ', newStatus: 'Draft',
          })
          const notifications = [...s.notifications]
          if (submit) {
            appendAudit({ auditLog }, {
              rfqId: rfq.id, user: actorName, role: 'Sales', module: 'RFQ',
              record: rfq.rfqNumber, action: 'Submitted RFQ for Operations review',
              previousStatus: 'Draft', newStatus: 'Operations Review',
            })
            appendNotification({ notifications }, `${rfq.rfqNumber} has been submitted for Operations review.`, 'info', 'Operations', rfq.id)
          }
          return { rfqs: [rfq, ...s.rfqs], auditLog, notifications }
        })

        return rfq
      },

      updateRFQ: (id, patch) => {
        set((s) => ({ rfqs: s.rfqs.map((r) => (r.id === id ? touch({ ...r, ...patch }) : r)) }))
      },

      submitRFQ: (id, actorName) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: 'Sales', module: 'RFQ', record: r.rfqNumber,
              action: 'Submitted RFQ for Operations review', previousStatus: r.stage, newStatus: 'Operations Review',
            })
            appendNotification({ notifications }, `${r.rfqNumber} has been submitted for Operations review.`, 'info', 'Operations', r.id)
            return touch({ ...r, stage: 'Operations Review', status: 'Operations Review' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      saveOperationsReview: (id, review) => {
        set((s) => ({ rfqs: s.rfqs.map((r) => (r.id === id ? touch({ ...r, operationsReview: review }) : r)) }))
      },

      approveOperations: (id, actorName) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: 'Operations', module: 'RFQ', record: r.rfqNumber,
              action: 'Approved — technically feasible, forwarded to Sourcing',
              previousStatus: r.stage, newStatus: 'Sourcing',
            })
            appendNotification({ notifications }, `${r.rfqNumber} is awaiting vendor sourcing.`, 'success', 'Sourcing', r.id)
            return touch({ ...r, stage: 'Sourcing', status: 'Sourcing' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      updateItemTechData: (id, itemId, fieldKey, value) => {
        set((s) => ({
          rfqs: s.rfqs.map((r) =>
            r.id !== id
              ? r
              : touch({
                  ...r,
                  items: r.items.map((it) =>
                    it.id !== itemId ? it : { ...it, technicalData: applyFieldChange(it.technicalData ?? {}, fieldKey, value) },
                  ),
                }),
          ),
        }))
      },

      confirmItemSourcing: (id, itemId, confirmed) => {
        set((s) => ({
          rfqs: s.rfqs.map((r) =>
            r.id !== id ? r : touch({ ...r, items: r.items.map((it) => (it.id !== itemId ? it : { ...it, sourcingConfirmed: confirmed })) }),
          ),
        }))
      },

      assignProcessVendor: (id, itemId, processKey, vendorId, vendorName) => {
        set((s) => ({
          rfqs: s.rfqs.map((r) => {
            if (r.id !== id) return r
            return touch({
              ...r,
              items: r.items.map((it) => {
                if (it.id !== itemId) return it
                const others = (it.processVendors ?? []).filter((p) => p.processKey !== processKey)
                return { ...it, processVendors: [...others, { processKey, vendorId, vendorName }] }
              }),
            })
          }),
        }))
      },

      saveSourcingComment: (id, comment) => {
        set((s) => ({ rfqs: s.rfqs.map((r) => (r.id === id ? touch({ ...r, sourcingComments: comment }) : r)) }))
      },

      submitSourcing: (id, actorName) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: 'Sourcing', module: 'RFQ', record: r.rfqNumber,
              action: 'Best vendor selected, submitted to Controlling',
              previousStatus: r.stage, newStatus: 'Controlling',
            })
            appendNotification({ notifications }, `${r.rfqNumber} is awaiting commercial pricing.`, 'info', 'Controlling', r.id)
            return touch({ ...r, stage: 'Controlling', status: 'Controlling' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      saveCostBreakdown: (id, lines) => {
        set((s) => ({
          rfqs: s.rfqs.map((r) =>
            r.id === id
              ? touch({ ...r, costBreakdown: lines, value: lines.reduce((sum, l) => sum + l.finalPrice, 0) })
              : r,
          ),
        }))
      },

      submitControlling: (id, actorName) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: 'Controlling', module: 'RFQ', record: r.rfqNumber,
              action: 'Commercial pricing calculated, submitted for approval',
              previousStatus: r.stage, newStatus: 'Approval Pending',
            })
            appendNotification({ notifications }, `Quotation for ${r.rfqNumber} is awaiting final approval.`, 'info', 'Approval Panel', r.id)
            return touch({ ...r, stage: 'Approval Pending', status: 'Approval Pending' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      approveFinal: (id, actorName, comment) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: 'Approval Panel', module: 'RFQ', record: r.rfqNumber,
              action: 'Final quotation approved', previousStatus: r.stage, newStatus: 'Approved', comment,
            })
            appendNotification({ notifications }, `${r.rfqNumber} was approved.`, 'success', 'Sales', r.id)
            return touch({ ...r, stage: 'Approved', status: 'Approved' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      sendBack: (id, targetStage, actorRole, actorName, comment) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: actorRole, module: 'RFQ', record: r.rfqNumber,
              action: `Sent back to ${STAGE_OWNER[targetStage] ?? targetStage}`,
              previousStatus: r.stage, newStatus: targetStage, comment,
            })
            appendNotification({ notifications }, `${r.rfqNumber} was returned with comments.`, 'warning', STAGE_OWNER[targetStage] ?? undefined, r.id)
            return touch({ ...r, stage: targetStage, status: targetStage })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      rejectRFQ: (id, actorRole, actorName, reason, comment) => {
        set((s) => {
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== id) return r
            appendAudit({ auditLog }, {
              rfqId: r.id, user: actorName, role: actorRole, module: 'RFQ', record: r.rfqNumber,
              action: `Rejected RFQ — ${reason}`, previousStatus: r.stage, newStatus: 'Rejected', comment,
            })
            appendNotification({ notifications }, `${r.rfqNumber} was rejected.`, 'error', 'Sales', r.id)
            return touch({ ...r, stage: 'Rejected', status: 'Rejected' })
          })
          return { rfqs, auditLog, notifications }
        })
      },

      generateQuotation: (id, actorName) => {
        let created: Quotation | undefined
        set((s) => {
          const rfq = s.rfqs.find((r) => r.id === id)
          if (!rfq) return s
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          const quotationNumber = nextQuotationNumber(s.quotations.map((q) => q.quotationNumber))
          const quotation: Quotation = {
            id: uid('quo'),
            quotationNumber,
            rfqId: rfq.id,
            rfqNumber: rfq.rfqNumber,
            customerId: rfq.customerId,
            customerName: rfq.endCustomer,
            projectName: rfq.projectName,
            quoteDate: new Date().toISOString(),
            validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
            currency: rfq.currency,
            amount: rfq.value,
            marginPercent: rfq.costBreakdown.length
              ? rfq.costBreakdown.reduce((sum, l) => sum + l.marginPercent, 0) / rfq.costBreakdown.length
              : rfq.targetMarginPercent,
            status: 'Draft',
            salesPerson: actorName,
          }
          appendAudit({ auditLog }, {
            rfqId: rfq.id, user: actorName, role: 'Sales', module: 'Quotation', record: quotationNumber,
            action: 'Quotation generated', previousStatus: rfq.stage, newStatus: 'Quotation Generated',
          })
          appendNotification({ notifications }, `Quotation generated for ${rfq.rfqNumber}.`, 'success', undefined, rfq.id, quotation.id)
          const rfqs = s.rfqs.map((r) => (r.id === id ? touch({ ...r, stage: 'Quotation Generated', status: 'Quotation Generated' }) : r))
          created = quotation
          return { rfqs, quotations: [quotation, ...s.quotations], auditLog, notifications }
        })
        return created!
      },

      sendQuotation: (id, actorName) => {
        set((s) => {
          const rfq = s.rfqs.find((r) => r.id === id)
          if (!rfq) return s
          const auditLog = [...s.auditLog]
          const notifications = [...s.notifications]
          appendAudit({ auditLog }, {
            rfqId: rfq.id, user: actorName, role: 'Sales', module: 'Quotation', record: rfq.rfqNumber,
            action: 'Quotation sent to customer', previousStatus: rfq.stage, newStatus: 'Quotation Sent',
          })
          appendNotification({ notifications }, `Quotation for ${rfq.rfqNumber} was sent to the customer.`, 'success', undefined, rfq.id)
          const rfqs = s.rfqs.map((r) => (r.id === id ? touch({ ...r, stage: 'Quotation Sent', status: 'Quotation Sent' }) : r))
          const quotations = s.quotations.map((q) => (q.rfqId === id ? { ...q, status: 'Sent' as QuotationStatus } : q))
          return { rfqs, quotations, auditLog, notifications }
        })
      },

      updateQuotationStatus: (quotationId, status, actorName, lossReason) => {
        set((s) => {
          const quotation = s.quotations.find((q) => q.id === quotationId)
          if (!quotation) return s
          const auditLog = [...s.auditLog]
          appendAudit({ auditLog }, {
            rfqId: quotation.rfqId, user: actorName, role: 'Sales', module: 'Quotation', record: quotation.quotationNumber,
            action: `Customer response updated: ${status}`, comment: lossReason ? `Loss reason: ${lossReason}` : undefined,
          })
          const quotations = s.quotations.map((q) => (q.id === quotationId ? { ...q, status, lossReason: lossReason ?? q.lossReason } : q))
          const rfqs = s.rfqs.map((r) => {
            if (r.id !== quotation.rfqId) return r
            if (status === 'Won') return touch({ ...r, stage: 'Won', status: 'Won' })
            if (status === 'Lost') return touch({ ...r, stage: 'Lost', status: 'Lost', lossReason })
            return touch(r)
          })
          return { quotations, rfqs, auditLog }
        })
      },

      markNotificationRead: (id) => {
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }))
      },
      markAllNotificationsRead: () => {
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
      },

      upsertCustomer: (c) => {
        set((s) => {
          const exists = s.customers.some((x) => x.id === c.id)
          return { customers: exists ? s.customers.map((x) => (x.id === c.id ? c : x)) : [c, ...s.customers] }
        })
      },
      upsertVendor: (v) => {
        set((s) => {
          const exists = s.vendors.some((x) => x.id === v.id)
          return { vendors: exists ? s.vendors.map((x) => (x.id === v.id ? v : x)) : [v, ...s.vendors] }
        })
      },
      upsertProduct: (p) => {
        set((s) => {
          const exists = s.products.some((x) => x.id === p.id)
          return { products: exists ? s.products.map((x) => (x.id === p.id ? p : x)) : [p, ...s.products] }
        })
      },
    }),
    { name: 'rfq-prototype-data' },
  ),
)

export function getNextStageOwner(stage: Stage): Role | null {
  const next = NEXT_STAGE[stage]
  return next ? STAGE_OWNER[next] : null
}
