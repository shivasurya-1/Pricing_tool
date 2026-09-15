import { useNavigate } from 'react-router-dom'
import type { RFQ } from '@/types'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PriorityBadge } from '@/components/PriorityBadge'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/format'
import { stageAge } from '@/lib/dashboardStats'
import { actionRouteForRfq } from '@/lib/routes'

export function ActionQueueTable({
  rfqs,
  actionLabel = 'Open',
  emptyTitle = 'Nothing waiting on you',
  emptyDescription = 'New RFQs will show up here as they reach your stage.',
}: {
  rfqs: RFQ[]
  actionLabel?: string
  emptyTitle?: string
  emptyDescription?: string
}) {
  const navigate = useNavigate()

  const columns: Column<RFQ>[] = [
    { key: 'rfqNumber', header: 'RFQ', render: (r) => <span className="font-medium text-[var(--color-blue)]">{r.rfqNumber}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.endCustomer },
    { key: 'value', header: 'Value', align: 'right', render: (r) => formatCurrency(r.value, r.currency) },
    { key: 'stage', header: 'Stage', render: (r) => <StatusBadge stage={r.stage} /> },
    { key: 'age', header: 'Age', render: (r) => `${stageAge(r)}d` },
    { key: 'priority', header: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <Button size="sm" variant="primary" onClick={() => navigate(actionRouteForRfq(r))}>
          {actionLabel}
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rfqs}
      keyField={(r) => r.id}
      onRowClick={(r) => navigate(`/rfqs/${r.id}`)}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  )
}
