import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/components/PageHeader'
import { startTour } from '@/lib/tour'
import { SalesDashboard } from '@/features/dashboard/SalesDashboard'
import { OperationsDashboard } from '@/features/dashboard/OperationsDashboard'
import { SourcingDashboard } from '@/features/dashboard/SourcingDashboard'
import { ControllingDashboard } from '@/features/dashboard/ControllingDashboard'
import { ApprovalDashboard } from '@/features/dashboard/ApprovalDashboard'
import { AdminDashboard } from '@/features/dashboard/AdminDashboard'

const DASHBOARDS = {
  Sales: SalesDashboard,
  Operations: OperationsDashboard,
  Sourcing: SourcingDashboard,
  Controlling: ControllingDashboard,
  'Approval Panel': ApprovalDashboard,
  Admin: AdminDashboard,
}

export function DashboardPage() {
  const role = useAuthStore((s) => s.role)
  const name = useAuthStore((s) => s.name)
  const toursSeen = useAuthStore((s) => s.toursSeen)
  const markTourSeen = useAuthStore((s) => s.markTourSeen)

  useEffect(() => {
    if (!toursSeen[role]) {
      const t = window.setTimeout(() => {
        startTour(role)
        markTourSeen(role)
      }, 600)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  const Dashboard = DASHBOARDS[role]

  return (
    <div>
      <PageHeader title={`${role} Dashboard`} description={`Welcome back, ${name}. Here's what needs your attention today.`} />
      <Dashboard />
    </div>
  )
}
