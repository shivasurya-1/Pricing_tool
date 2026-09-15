import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, type Tone } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Quotation, QuotationStatus } from '@/types'
import { useUiStore } from '@/store/uiStore'

const STATUS_TONE: Record<QuotationStatus, Tone> = {
  Draft: 'neutral',
  'Pending Approval': 'amber',
  Approved: 'blue',
  Sent: 'blue',
  Viewed: 'purple',
  Negotiation: 'amber',
  Won: 'green',
  Lost: 'red',
  Expired: 'neutral',
}

export function QuotationListPage() {
  const navigate = useNavigate()
  const quotations = useDataStore((s) => s.quotations)
  const pushToast = useUiStore((s) => s.pushToast)
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = statusFilter ? quotations.filter((q) => q.status === statusFilter) : quotations

  const columns: Column<Quotation>[] = [
    { key: 'number', header: 'Quotation #', render: (q) => <span className="font-medium text-[var(--color-blue)]">{q.quotationNumber}</span> },
    { key: 'rfq', header: 'RFQ #', render: (q) => q.rfqNumber },
    { key: 'customer', header: 'Customer', render: (q) => q.customerName },
    { key: 'date', header: 'Quote Date', render: (q) => formatDate(q.quoteDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (q) => formatCurrency(q.amount, q.currency) },
    { key: 'currency', header: 'Currency', render: (q) => q.currency },
    { key: 'margin', header: 'Margin', align: 'right', render: (q) => `${q.marginPercent.toFixed(1)}%` },
    { key: 'status', header: 'Status', render: (q) => <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge> },
    { key: 'validUntil', header: 'Valid Until', render: (q) => formatDate(q.validUntil) },
    { key: 'salesPerson', header: 'Sales Person', render: (q) => q.salesPerson },
    {
      key: 'action',
      header: 'Action',
      render: (q) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/quotations/${q.id}`)}>
          View
        </Button>
      ),
    },
  ]

  const statuses: QuotationStatus[] = ['Draft', 'Pending Approval', 'Approved', 'Sent', 'Viewed', 'Negotiation', 'Won', 'Lost', 'Expired']

  return (
    <div>
      <PageHeader
        title="Quotations"
        description={`${filtered.length} of ${quotations.length} quotations`}
        actions={
          <Button variant="secondary" icon={<Download size={15} />} onClick={() => pushToast('Quotation list exported (mock).', 'success')}>
            Export
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          keyField={(q) => q.id}
          onRowClick={(q) => navigate(`/quotations/${q.id}`)}
          emptyTitle="No quotations found"
          emptyDescription="Quotations appear here once an approved RFQ is generated."
        />
      </Card>
    </div>
  )
}
