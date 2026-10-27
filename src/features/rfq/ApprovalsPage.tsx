import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PriorityBadge } from '@/components/PriorityBadge'
import { formatCurrency, formatDate } from '@/lib/format'

/**
 * The sidebar's Approvals page: straight to the Final Approval screen when exactly one
 * RFQ is waiting for approval, otherwise the RFQs waiting, each opening that screen.
 */
export function ApprovalsPage() {
  const navigate = useNavigate()
  const loaded = useDataStore((s) => s.loaded)
  const pending = useDataStore((s) => s.rfqs).filter((r) => r.stage === 'Approval Pending')

  if (loaded && pending.length === 1) return <Navigate to={`/rfqs/${pending[0].id}/approval`} replace />

  return (
    <div>
      <PageHeader title="Approvals" description="RFQs waiting for final approval." />
      {!loaded ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Loading…</p>
      ) : pending.length === 0 ? (
        <EmptyState title="Nothing to approve" description="No RFQ is waiting for final approval right now." />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.rfqNumber} <span className="font-normal text-[var(--color-ink-soft)]">— {r.endCustomer}</span>
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {r.projectName || '—'} · {r.items.length} {r.items.length === 1 ? 'pulley' : 'pulleys'} · Quotation value {formatCurrency(r.value)}
                    {r.requiredDeliveryDate ? ` · Delivery ${formatDate(r.requiredDeliveryDate)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <PriorityBadge priority={r.priority} />
                  <Button size="sm" variant="primary" icon={<ArrowRight size={13} />} onClick={() => navigate(`/rfqs/${r.id}/approval`)}>
                    Review &amp; Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
