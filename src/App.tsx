import { useEffect, type ReactElement } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useFormulaStore } from '@/store/formulaStore'
import { setNavigateRef } from '@/lib/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { RFQListPage } from '@/features/rfq/RFQListPage'
import { RFQCreatePage } from '@/features/rfq/RFQCreatePage'
import { RFQDetailPage } from '@/features/rfq/RFQDetailPage'
import { OperationsReviewScreen } from '@/features/rfq/OperationsReviewScreen'
import { SourcingScreen } from '@/features/rfq/SourcingScreen'
import { ControllingScreen } from '@/features/rfq/ControllingScreen'
import { ApprovalScreen } from '@/features/rfq/ApprovalScreen'
import { QuotationListPage } from '@/features/quotations/QuotationListPage'
import { QuotationDetailPage } from '@/features/quotations/QuotationDetailPage'
import { MyTasksPage } from '@/features/tasks/MyTasksPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { CustomersPage } from '@/features/masters/CustomersPage'
import { VendorsPage } from '@/features/masters/VendorsPage'
import { PricingToolPage } from '@/features/pricingtool/PricingToolPage'
import { CostRateTablesPage } from '@/features/costrates/CostRateTablesPage'
import { RawForgingPricesPage } from '@/features/costrates/RawForgingPricesPage'
import { BearingSleeveDataPage } from '@/features/costrates/BearingSleeveDataPage'
import { DeliverySchedulePage } from '@/features/costrates/DeliverySchedulePage'
import { MhrLhrCalculatorPage } from '@/features/costrates/MhrLhrCalculatorPage'
import { FormulasPage } from '@/features/formulas/FormulasPage'
import { ProductsPage } from '@/features/masters/ProductsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { AuditLogPage } from '@/features/audit/AuditLogPage'
import { UsersRolesPage } from '@/features/admin/UsersRolesPage'
import { SettingsPage } from '@/features/admin/SettingsPage'

function RequireAuth({ children }: { children: ReactElement }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const navigate = useNavigate()

  useEffect(() => {
    setNavigateRef(navigate)
  }, [navigate])

  useEffect(() => {
    // Best-effort: if the backend isn't running/deployed, calc modules use their
    // static fallback — see formulaStore.loadAll() and MhrLhrCalculatorPage's note.
    useFormulaStore.getState().loadAll()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/rfqs" element={<RFQListPage />} />
        <Route path="/rfqs/new" element={<RFQCreatePage />} />
        <Route path="/rfqs/:id" element={<RFQDetailPage />} />
        <Route path="/rfqs/:id/operations" element={<OperationsReviewScreen />} />
        <Route path="/rfqs/:id/sourcing" element={<SourcingScreen />} />
        <Route path="/rfqs/:id/costing" element={<ControllingScreen />} />
        <Route path="/rfqs/:id/approval" element={<ApprovalScreen />} />
        <Route path="/quotations" element={<QuotationListPage />} />
        <Route path="/quotations/:id" element={<QuotationDetailPage />} />
        <Route path="/tasks" element={<MyTasksPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/pricing-tool" element={<PricingToolPage />} />
        <Route path="/cost-rate-tables" element={<CostRateTablesPage />} />
        <Route path="/raw-forging-prices" element={<RawForgingPricesPage />} />
        <Route path="/bearing-sleeve-data" element={<BearingSleeveDataPage />} />
        <Route path="/delivery-schedule" element={<DeliverySchedulePage />} />
        <Route path="/in-house-hours" element={<MhrLhrCalculatorPage />} />
        <Route path="/formulas" element={<FormulasPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/users" element={<UsersRolesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
