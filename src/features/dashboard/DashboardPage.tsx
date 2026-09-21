import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
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
  // The very first thing a user sees after logging in — without this, a slow initial
  // fetch renders every KPI card/chart as "0" for a couple of seconds, which reads as
  // "the app is broken" rather than "still loading."
  const dataLoading = useDataStore((s) => s.loading)

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
      {dataLoading ? <EmptyState title="Loading your dashboard..." /> : <Dashboard />}
    </div>
  )
}
