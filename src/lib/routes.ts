import type { RFQ } from '@/types'

export function actionRouteForRfq(rfq: RFQ): string {
  switch (rfq.stage) {
    case 'Operations Review':
      return `/rfqs/${rfq.id}/operations`
    case 'Sourcing':
      return `/rfqs/${rfq.id}/sourcing`
    case 'Controlling':
      return `/rfqs/${rfq.id}/costing`
    case 'Approval Pending':
      return `/rfqs/${rfq.id}/approval`
    default:
      return `/rfqs/${rfq.id}`
  }
}
