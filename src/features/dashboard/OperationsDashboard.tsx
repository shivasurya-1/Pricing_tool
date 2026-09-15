import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { ActionQueueTable } from '@/components/ActionQueueTable'
import { CategoryBarChart, DonutChart } from '@/components/charts/Charts'
import { countStage, countStages, isOverdue, sortByAgeDesc, stageAge } from '@/lib/dashboardStats'
import { CATEGORICAL } from '@/components/charts/palette'

export function OperationsDashboard() {
  const rfqs = useDataStore((s) => s.rfqs)
  const auditLog = useDataStore((s) => s.auditLog)

  const pending = rfqs.filter((r) => r.stage === 'Operations Review')
  const overdue = pending.filter((r) => isOverdue(r, 3))
  const dueToday = pending.filter((r) => !isOverdue(r, 3) && stageAge(r) >= 2)
  const approved = countStages(rfqs, ['Sourcing', 'Controlling', 'Approval Pending', 'Approved', 'Quotation Generated', 'Quotation Sent', 'Won', 'Lost'])
  const returned = auditLog.filter((a) => a.role === 'Operations' && a.action.startsWith('Sent back')).length
  const rejected = countStage(rfqs, 'Rejected')

  const volumeByPriority = ['Low', 'Medium', 'High', 'Urgent'].map((p) => ({
    name: p,
    count: rfqs.filter((r) => r.priority === p).length,
  }))

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Pending Review" value={pending.length} />
        <KpiCard label="Due Today" value={dueToday.length} tone="amber" />
        <KpiCard label="Overdue" value={overdue.length} tone="red" />
        <KpiCard label="Approved" value={approved} tone="green" />
        <KpiCard label="Returned" value={returned} />
        <KpiCard label="Rejected" value={rejected} tone="red" />
      </div>

      <Card data-tour="primary-table">
        <CardHeader title="Pending Reviews" description="RFQs waiting on Operations feasibility review" />
        <ActionQueueTable rfqs={sortByAgeDesc(pending)} actionLabel="Review Now" emptyTitle="No pending reviews" emptyDescription="You're all caught up." />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="RFQ Volume by Priority" />
          <div className="p-4">
            <CategoryBarChart data={volumeByPriority} series={[{ key: 'count', label: 'RFQs', color: CATEGORICAL[0] }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Approval / Rejection Ratio" />
          <div className="p-4">
            <DonutChart data={[{ name: 'Approved onward', value: approved }, { name: 'Rejected', value: rejected }, { name: 'Pending', value: pending.length }]} />
          </div>
        </Card>
      </div>
    </div>
  )
}
