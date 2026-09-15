import type { RFQ, Role, Task } from '@/types'
import { STAGE_OWNER } from '@/lib/workflow'
import { ageInDays } from '@/lib/format'

const ACTION_LABEL: Record<string, string> = {
  Draft: 'Submit RFQ',
  'Operations Review': 'Review feasibility',
  Sourcing: 'Select best vendor',
  Controlling: 'Calculate commercial pricing',
  'Approval Pending': 'Approve / reject',
  Approved: 'Generate quotation',
  'Quotation Generated': 'Send quotation to customer',
  'Quotation Sent': 'Track customer response',
}

export function deriveTasksForRole(rfqs: RFQ[], role: Role): Task[] {
  return rfqs
    .filter((rfq) => {
      const owner = STAGE_OWNER[rfq.stage]
      if (role === 'Admin') return owner !== null
      return owner === role
    })
    .map((rfq) => ({
      id: `task-${rfq.id}`,
      title: ACTION_LABEL[rfq.stage] ?? 'Review',
      rfqId: rfq.id,
      rfqNumber: rfq.rfqNumber,
      customerName: rfq.endCustomer,
      stage: rfq.stage,
      priority: rfq.priority,
      dueDate: rfq.requiredDeliveryDate,
      createdAt: rfq.updatedAt,
      role: STAGE_OWNER[rfq.stage] ?? role,
      action: ACTION_LABEL[rfq.stage] ?? 'Review',
    }))
    .sort((a, b) => ageInDays(b.createdAt) - ageInDays(a.createdAt))
}
