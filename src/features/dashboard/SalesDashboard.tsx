import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Receipt } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ActionQueueTable } from '@/components/ActionQueueTable'
import { StageFunnel } from '@/components/charts/StageFunnel'
import { DonutChart } from '@/components/charts/Charts'
import { countStage, sortByAgeDesc } from '@/lib/dashboardStats'
import { STAGE_OWNER } from '@/lib/workflow'

export function SalesDashboard() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const quotations = useDataStore((s) => s.quotations)

  const newRfqs = rfqs.filter((r) => {
    const days = (Date.now() - new Date(r.createdAt).getTime()) / 86400000
    return days <= 4
  }).length
  const inProgress = countStage(rfqs, 'Operations Review') + countStage(rfqs, 'Sourcing') + countStage(rfqs, 'Controlling')
  const awaitingApproval = countStage(rfqs, 'Approval Pending')
  const approved = countStage(rfqs, 'Approved')
  const quotationsSent = quotations.filter((q) => q.status === 'Sent' || q.status === 'Viewed' || q.status === 'Negotiation').length
  const won = countStage(rfqs, 'Won')
  const lost = countStage(rfqs, 'Lost')

  const myActionItems = sortByAgeDesc(rfqs.filter((r) => STAGE_OWNER[r.stage] === 'Sales'))
  const recentRfqs = [...rfqs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)

  const funnelStages: { label: string; count: number }[] = [
    { label: 'Received', count: rfqs.length },
    { label: 'Operations', count: countStage(rfqs, 'Operations Review') },
    { label: 'Sourcing', count: countStage(rfqs, 'Sourcing') },
    { label: 'Controlling', count: countStage(rfqs, 'Controlling') },
    { label: 'Approval', count: countStage(rfqs, 'Approval Pending') },
    { label: 'Quotation', count: countStage(rfqs, 'Quotation Generated') + countStage(rfqs, 'Quotation Sent') },
  ]

  const responseData = [
    { name: 'Won', value: won },
    { name: 'Lost', value: lost },
    { name: 'Negotiation', value: quotations.filter((q) => q.status === 'Negotiation').length },
    { name: 'Pending', value: quotations.filter((q) => q.status === 'Sent' || q.status === 'Viewed').length },
  ]

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="New RFQs" value={newRfqs} />
        <KpiCard label="In Progress" value={inProgress} />
        <KpiCard label="Awaiting Approval" value={awaitingApproval} />
        <KpiCard label="Approved" value={approved} tone="green" />
        <KpiCard label="Quotations Sent" value={quotationsSent} />
        <KpiCard label="Won" value={won} tone="green" />
        <KpiCard label="Lost" value={lost} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="RFQ Pipeline" description="Where every open RFQ sits right now" />
          <div className="p-4">
            <StageFunnel stages={funnelStages} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Customer Response" />
          <div className="p-4">
            <DonutChart data={responseData} height={150} />
          </div>
        </Card>
      </div>

      <Card data-tour="primary-table">
        <CardHeader title="My Action Items" description="RFQs waiting on Sales right now" />
        <ActionQueueTable rfqs={myActionItems} actionLabel="Open" />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent RFQs" />
          <ActionQueueTable rfqs={recentRfqs} actionLabel="View" emptyTitle="No RFQs yet" />
        </Card>
        <Card>
          <CardHeader title="Quick Actions" />
          <div className="flex flex-col gap-2 p-4">
            <Button data-tour="primary-action" variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/rfqs/new')}>
              Create RFQ
            </Button>
            <Button variant="secondary" icon={<FileText size={15} />} onClick={() => navigate('/rfqs')}>
              View RFQs
            </Button>
            <Button variant="secondary" icon={<Receipt size={15} />} onClick={() => navigate('/quotations')}>
              View Quotations
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
