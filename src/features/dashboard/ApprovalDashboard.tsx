import { useNavigate } from 'react-router-dom'
import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Button } from '@/components/ui/Button'
import { countStage } from '@/lib/dashboardStats'
import { summarizeCostBreakdown, marginStatus, marginStatusColor } from '@/lib/pricing'
import { formatCurrency, formatDate } from '@/lib/format'
import type { RFQ } from '@/types'
import clsx from 'clsx'

export function ApprovalDashboard() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const auditLog = useDataStore((s) => s.auditLog)

  const pending = rfqs.filter((r) => r.stage === 'Approval Pending')
  const highValue = pending.filter((r) => r.value > 600000)
  const lowMargin = pending.filter((r) => {
    const s = summarizeCostBreakdown(r.costBreakdown)
    return marginStatus(s.marginPercent, r.targetMarginPercent) !== 'healthy'
  })
  const approved = countStage(rfqs, 'Approved') + countStage(rfqs, 'Quotation Generated') + countStage(rfqs, 'Quotation Sent') + countStage(rfqs, 'Won') + countStage(rfqs, 'Lost')
  const rejected = auditLog.filter((a) => a.role === 'Approval Panel' && a.action.startsWith('Rejected')).length + countStage(rfqs, 'Rejected')
  const returned = auditLog.filter((a) => a.role === 'Approval Panel' && a.action.startsWith('Sent back')).length

  const columns: Column<RFQ>[] = [
    { key: 'rfqNumber', header: 'RFQ', render: (r) => <span className="font-medium text-[var(--color-blue)]">{r.rfqNumber}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.endCustomer },
    { key: 'value', header: 'Quote Value', align: 'right', render: (r) => formatCurrency(r.value, r.currency) },
    {
      key: 'margin',
      header: 'Margin %',
      align: 'right',
      render: (r) => {
        const s = summarizeCostBreakdown(r.costBreakdown)
        const status = marginStatus(s.marginPercent, r.targetMarginPercent)
        return <span className={clsx('rounded border px-1.5 py-0.5 text-xs font-semibold', marginStatusColor[status])}>{s.marginPercent.toFixed(1)}%</span>
      },
    },
    { key: 'owner', header: 'Sales Owner', render: (r) => r.salesPerson },
    { key: 'submitted', header: 'Submitted', render: (r) => formatDate(r.updatedAt) },
    { key: 'priority', header: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <Button size="sm" variant="primary" onClick={() => navigate(`/rfqs/${r.id}/approval`)}>
          Review
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Pending Approval" value={pending.length} />
        <KpiCard label="High Value" value={highValue.length} />
        <KpiCard label="Low Margin" value={lowMargin.length} tone={lowMargin.length > 0 ? 'amber' : 'neutral'} />
        <KpiCard label="Approved" value={approved} tone="green" />
        <KpiCard label="Rejected" value={rejected} tone="red" />
        <KpiCard label="Returned" value={returned} />
      </div>

      <Card data-tour="primary-table">
        <CardHeader title="Approval Queue" description="Final sign-off on cost, margin and terms" />
        <DataTable
          columns={columns}
          rows={pending}
          keyField={(r) => r.id}
          onRowClick={(r) => navigate(`/rfqs/${r.id}`)}
          emptyTitle="No approvals pending"
          emptyDescription="Nothing waiting on the Approval Panel."
        />
      </Card>
    </div>
  )
}
