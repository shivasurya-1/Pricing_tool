import type { Role, Stage } from '@/types'

/**
 * Central workflow metadata — the single source of truth for how an RFQ moves
 * through the pipeline. Stage-mutating logic lives in the rfq store; this file
 * only describes the shape of the state machine (spec §2, §41, §42, §43).
 */

export const STAGE_ORDER: Stage[] = [
  'Draft',
  'Operations Review',
  'Sourcing',
  'Controlling',
  'Approval Pending',
  'Approved',
  'Quotation Generated',
  'Quotation Sent',
]

export const FUNNEL_STAGES: Stage[] = [
  'Draft',
  'Operations Review',
  'Sourcing',
  'Controlling',
  'Approval Pending',
  'Quotation Generated',
]

/** Which role must act while the RFQ sits in a given stage. */
export const STAGE_OWNER: Record<Stage, Role | null> = {
  Draft: 'Sales',
  'Operations Review': 'Operations',
  Sourcing: 'Sourcing',
  Controlling: 'Controlling',
  'Approval Pending': 'Approval Panel',
  Approved: 'Sales',
  'Quotation Generated': 'Sales',
  'Quotation Sent': 'Sales',
  Won: null,
  Lost: null,
  Rejected: null,
}

/** Forward progression when a stage's owner takes the primary action. */
export const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  Draft: 'Operations Review',
  'Operations Review': 'Sourcing',
  Sourcing: 'Controlling',
  Controlling: 'Approval Pending',
  'Approval Pending': 'Approved',
  Approved: 'Quotation Generated',
  'Quotation Generated': 'Quotation Sent',
}

/** Valid "Send Back" targets per spec §2 / §42. */
export const SEND_BACK_TARGETS: Partial<Record<Stage, Stage[]>> = {
  'Operations Review': ['Draft'],
  Sourcing: ['Operations Review', 'Draft'],
  Controlling: ['Sourcing', 'Draft'],
  'Approval Pending': ['Controlling', 'Sourcing', 'Draft'],
}

export const SEND_BACK_LABELS: Record<Stage, string> = {
  Draft: 'Sales',
  'Operations Review': 'Operations',
  Sourcing: 'Sourcing',
  Controlling: 'Controlling',
  'Approval Pending': 'Approval Panel',
  Approved: 'Sales',
  'Quotation Generated': 'Sales',
  'Quotation Sent': 'Sales',
  Won: 'Sales',
  Lost: 'Sales',
  Rejected: 'Sales',
}

/** Which stages a role is allowed to reject an RFQ from. */
export const REJECTABLE_STAGES: Stage[] = ['Operations Review', 'Sourcing', 'Controlling', 'Approval Pending']

export const REJECTION_REASONS = [
  'Not technically feasible',
  'Pricing not viable',
  'Customer requirements unclear',
  'Vendor unavailable',
  'Duplicate RFQ',
  'Other',
]

export const LOSS_REASONS = ['Price', 'Delivery', 'Competitor', 'Technical', 'Customer Cancelled', 'Other']

export const STAGE_TONE: Record<Stage, 'neutral' | 'teal' | 'purple' | 'orange' | 'blue' | 'green' | 'red' | 'amber'> = {
  Draft: 'neutral',
  'Operations Review': 'teal',
  Sourcing: 'purple',
  Controlling: 'orange',
  'Approval Pending': 'blue',
  Approved: 'green',
  'Quotation Generated': 'blue',
  'Quotation Sent': 'blue',
  Won: 'green',
  Lost: 'red',
  Rejected: 'red',
}

export function canRoleActOnStage(role: Role, stage: Stage): boolean {
  if (role === 'Admin') return true
  return STAGE_OWNER[stage] === role
}

export function isTerminalStage(stage: Stage): boolean {
  return stage === 'Won' || stage === 'Lost' || stage === 'Rejected'
}
