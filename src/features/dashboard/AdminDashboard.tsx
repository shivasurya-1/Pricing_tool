import { useNavigate } from 'react-router-dom'
import { Users, Package, History, Settings } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StageFunnel } from '@/components/charts/StageFunnel'
import { countStage, countStages } from '@/lib/dashboardStats'
import { STAGE_OWNER } from '@/lib/workflow'
import { formatCurrency } from '@/lib/format'
import { ROLES, type Role } from '@/types'

export function AdminDashboard() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const quotations = useDataStore((s) => s.quotations)

  const totalRfqs = rfqs.length
  const openRfqs = countStages(rfqs, ['Draft', 'Operations Review', 'Sourcing', 'Controlling', 'Approval Pending', 'Approved', 'Quotation Generated', 'Quotation Sent'])
  const pendingActions = rfqs.filter((r) => STAGE_OWNER[r.stage] !== null).length
  const completed = countStages(rfqs, ['Won', 'Lost'])
  const won = countStage(rfqs, 'Won')
  const winRate = completed > 0 ? Math.round((won / completed) * 100) : 0
  const pipelineValue = rfqs.filter((r) => !['Won', 'Lost', 'Rejected'].includes(r.stage)).reduce((s, r) => s + r.value, 0)

  const funnelStages = [
    { label: 'Draft', count: countStage(rfqs, 'Draft') },
    { label: 'Operations', count: countStage(rfqs, 'Operations Review') },
    { label: 'Sourcing', count: countStage(rfqs, 'Sourcing') },
    { label: 'Controlling', count: countStage(rfqs, 'Controlling') },
    { label: 'Approval', count: countStage(rfqs, 'Approval Pending') },
    { label: 'Quotation', count: countStage(rfqs, 'Quotation Generated') + countStage(rfqs, 'Quotation Sent') },
  ]

  const workload: { role: Role; count: number }[] = ROLES.filter((r) => r !== 'Admin').map((role) => ({
    role,
    count: rfqs.filter((r) => STAGE_OWNER[r.stage] === role).length,
  }))

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total RFQs" value={totalRfqs} />
        <KpiCard label="Open RFQs" value={openRfqs} />
        <KpiCard label="Pending Actions" value={pendingActions} />
        <KpiCard label="Completed RFQs" value={completed} />
        <KpiCard label="Quotations" value={quotations.length} />
        <KpiCard label="Win Rate" value={`${winRate}%`} tone="green" />
        <KpiCard label="Pipeline Value" value={formatCurrency(pipelineValue)} />
        <KpiCard label="Active Users" value={6} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Organization-wide Pipeline" />
          <div className="p-4">
            <StageFunnel stages={funnelStages} />
          </div>
        </Card>
        <Card data-tour="primary-table">
          <CardHeader title="Team Workload" description="RFQs currently owned by each team" />
          <div className="space-y-2.5 p-4">
            {workload.map((w) => (
              <div key={w.role} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-ink-soft)]">{w.role}</span>
                <span className="font-semibold text-[var(--color-ink)]">{w.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Administration" description="Manage masters, users, and review the audit trail" />
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <Button variant="secondary" icon={<Users size={15} />} onClick={() => navigate('/users')}>
            Users & Roles
          </Button>
          <Button variant="secondary" icon={<Package size={15} />} onClick={() => navigate('/products')}>
            Product Master
          </Button>
          <Button variant="secondary" icon={<History size={15} />} onClick={() => navigate('/audit-log')}>
            Audit Log
          </Button>
          <Button variant="secondary" icon={<Settings size={15} />} onClick={() => navigate('/settings')}>
            Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}
