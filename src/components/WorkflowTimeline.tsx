import { useState } from 'react'
import { Check, Circle, X } from 'lucide-react'
import clsx from 'clsx'
import type { AuditEvent, RFQ, Stage } from '@/types'
import { STAGE_ORDER } from '@/lib/workflow'
import { formatDateTime } from '@/lib/format'

interface TimelineNode {
  label: string
  team: string
  stage: Stage
  index: number
}

const NODES: TimelineNode[] = [
  { label: 'Sales', team: 'Sales', stage: 'Draft', index: 0 },
  { label: 'Operations', team: 'Operations', stage: 'Operations Review', index: 1 },
  { label: 'Sourcing', team: 'Sourcing', stage: 'Sourcing', index: 2 },
  { label: 'Controlling', team: 'Controlling', stage: 'Controlling', index: 3 },
  { label: 'Approval', team: 'Approval Panel', stage: 'Approval Pending', index: 4 },
  { label: 'Sales', team: 'Sales', stage: 'Approved', index: 5 },
]

const NODE_TASK: Record<number, string> = {
  0: 'Create RFQ',
  1: 'Feasibility review',
  2: 'Vendor pricing / best source',
  3: 'Commercials / final price',
  4: 'Final approval',
  5: 'Generate & share quotation',
}

type NodeStatus = 'completed' | 'current' | 'pending' | 'rejected'

function durationBetween(a: string, b: string): string {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  const hours = ms / 3600000
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`
  return `${Math.round(hours / 24)}d`
}

export function WorkflowTimeline({ rfq, auditLog }: { rfq: RFQ; auditLog: AuditEvent[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const rfqAudit = auditLog.filter((a) => a.rfqId === rfq.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  let currentIndex = STAGE_ORDER.indexOf(rfq.stage)
  if (rfq.stage === 'Won' || rfq.stage === 'Lost') currentIndex = 8

  let rejectedAtIndex: number | null = null
  if (rfq.stage === 'Rejected') {
    const rejectEvent = rfqAudit.find((a) => a.newStatus === 'Rejected')
    rejectedAtIndex = rejectEvent?.previousStatus ? STAGE_ORDER.indexOf(rejectEvent.previousStatus) : 0
  }

  const statusFor = (node: TimelineNode): NodeStatus => {
    if (rejectedAtIndex !== null) {
      if (node.index < rejectedAtIndex) return 'completed'
      if (node.index === rejectedAtIndex) return 'rejected'
      return 'pending'
    }
    if (node.index === 5) {
      if (currentIndex >= 8) return 'completed'
      if (currentIndex >= 5) return 'current'
      return 'pending'
    }
    if (currentIndex > node.index) return 'completed'
    if (currentIndex === node.index) return 'current'
    return 'pending'
  }

  const enteredEventFor = (node: TimelineNode) => rfqAudit.find((a) => a.newStatus === node.stage)
  const leftEventFor = (node: TimelineNode) => rfqAudit.find((a) => a.previousStatus === node.stage)

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-5">
      <div className="flex items-start">
        {NODES.map((node, i) => {
          const status = statusFor(node)
          const entered = enteredEventFor(node)
          const left = leftEventFor(node)
          const isOpen = expanded === i
          return (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {i > 0 && (
                  <div
                    className={clsx(
                      'h-0.5 flex-1',
                      statusFor(NODES[i - 1]) === 'completed' ? 'bg-[var(--color-green)]' : 'bg-[var(--color-border)]',
                    )}
                  />
                )}
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    status === 'completed' && 'border-[var(--color-green)] bg-[var(--color-green)] text-white',
                    status === 'current' && 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]',
                    status === 'pending' && 'border-[var(--color-border)] bg-white text-[var(--color-ink-faint)]',
                    status === 'rejected' && 'border-[var(--color-red)] bg-[var(--color-red)] text-white',
                  )}
                >
                  {status === 'completed' ? <Check size={15} /> : status === 'rejected' ? <X size={15} /> : <Circle size={8} fill="currentColor" />}
                </button>
                {i < NODES.length - 1 && (
                  <div
                    className={clsx('h-0.5 flex-1', status === 'completed' ? 'bg-[var(--color-green)]' : 'bg-[var(--color-border)]')}
                  />
                )}
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--color-ink)]">
                {i + 1}. {node.label}
              </p>
              <p
                className={clsx(
                  'mt-0.5 text-[11px] font-medium',
                  status === 'completed' && 'text-[var(--color-green)]',
                  status === 'current' && 'text-[var(--color-blue)]',
                  status === 'pending' && 'text-[var(--color-ink-faint)]',
                  status === 'rejected' && 'text-[var(--color-red)]',
                )}
              >
                {status === 'completed' ? 'Completed' : status === 'current' ? 'Current' : status === 'rejected' ? 'Rejected' : 'Pending'}
              </p>

              {isOpen && (
                <div className="mt-3 w-full max-w-[180px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left text-[11px]">
                  <p className="text-[var(--color-ink-faint)]">Task</p>
                  <p className="mb-1.5 font-medium text-[var(--color-ink)]">{NODE_TASK[node.index]}</p>
                  <p className="text-[var(--color-ink-faint)]">Team</p>
                  <p className="mb-1.5 font-medium text-[var(--color-ink)]">{node.team}</p>
                  {entered ? (
                    <>
                      <p className="text-[var(--color-ink-faint)]">User</p>
                      <p className="mb-1.5 font-medium text-[var(--color-ink)]">{entered.user}</p>
                      <p className="text-[var(--color-ink-faint)]">Date/time</p>
                      <p className="mb-1.5 font-medium text-[var(--color-ink)]">{formatDateTime(entered.timestamp)}</p>
                      <p className="text-[var(--color-ink-faint)]">Duration</p>
                      <p className="font-medium text-[var(--color-ink)]">
                        {left ? durationBetween(entered.timestamp, left.timestamp) : status === 'current' ? 'In progress' : '—'}
                      </p>
                    </>
                  ) : (
                    <p className="text-[var(--color-ink-faint)]">Not reached yet</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
