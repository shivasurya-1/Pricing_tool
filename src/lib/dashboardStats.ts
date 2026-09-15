import type { RFQ, Stage } from '@/types'
import { ageInDays } from '@/lib/format'

export function countStage(rfqs: RFQ[], stage: Stage): number {
  return rfqs.filter((r) => r.stage === stage).length
}

export function countStages(rfqs: RFQ[], stages: Stage[]): number {
  return rfqs.filter((r) => stages.includes(r.stage)).length
}

export function stageAge(rfq: RFQ): number {
  return ageInDays(rfq.updatedAt)
}

export function isOverdue(rfq: RFQ, thresholdDays = 5): boolean {
  return stageAge(rfq) > thresholdDays
}

export function averageAge(rfqs: RFQ[]): number {
  if (rfqs.length === 0) return 0
  return Math.round(rfqs.reduce((s, r) => s + stageAge(r), 0) / rfqs.length)
}

export function sortByAgeDesc(rfqs: RFQ[]): RFQ[] {
  return [...rfqs].sort((a, b) => stageAge(b) - stageAge(a))
}
