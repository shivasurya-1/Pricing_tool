import { useEffect, type ReactElement } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { canDo, useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore } from '@/store/formulaStore'
import { useReferenceStore } from '@/store/referenceStore'
import { setNavigateRef } from '@/lib/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { RFQListPage } from '@/features/rfq/RFQListPage'
import { RFQCreatePage } from '@/features/rfq/RFQCreatePage'
import { RFQDetailPage } from '@/features/rfq/RFQDetailPage'
import { OperationsReviewScreen } from '@/features/rfq/OperationsReviewScreen'
import { SourcingScreen } from '@/features/rfq/SourcingScreen'
import { ControllingScreen } from '@/features/rfq/ControllingScreen'
import { ApprovalScreen } from '@/features/rfq/ApprovalScreen'
import { ApprovalsPage } from '@/features/rfq/ApprovalsPage'
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
  const token = useAuthStore((s) => s.token)
  const sessionChecked = useAuthStore((s) => s.sessionChecked)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // After a reload the access token (memory only) is being renewed from the refresh cookie.
  if (!token) return sessionChecked ? <Navigate to="/login" replace /> : null
  return children
}

/** The Create RFQ page needs Create on the "Create RFQ" module, as the backend does. */
function RequireCreateRfq({ children }: { children: ReactElement }) {
  const canCreate = useAuthStore((s) => canDo(s, 'Create RFQ', 'create'))
  return canCreate ? children : <Navigate to="/rfqs" replace />
}

export default function App() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    setNavigateRef(navigate)
  }, [navigate])

  useEffect(() => {
    // Once on start: confirm the stored token with the server and re-apply the account's real
    // role, so an edited localStorage value can't unlock another role's pages.
    useAuthStore.getState().restoreSession()
  }, [])

  useEffect(() => {
    // Gated on auth: these calls send a real Authorization header now (see
    // apiClient.ts), so firing them before login would just 401/403 and throw an
    // error toast right on the login screen. Runs once right after
    // isAuthenticated flips true — on fresh login, or immediately on mount if a
    // persisted session/demo role is already active.
    if (!isAuthenticated) return
    // Best-effort: if the backend isn't running/deployed, calc modules use their
    // static fallback — see formulaStore.loadAll() and MhrLhrCalculatorPage's note.
    useFormulaStore.getState().loadAll()
    // RFQs/customers/vendors/products/quotations are real shared backend data now —
    // see dataStore.loadAll()'s note on why there's no local fallback here.
    useDataStore.getState().loadAll()
    // Catalogs/raw-forging-rates/in-house-hours — same static-fallback contract as
    // formulaStore, but see pulleyTechDataSchema.ts for why an empty (not missing)
    // catalog does NOT fall back once this has loaded.
    useReferenceStore.getState().loadAll()
  }, [isAuthenticated])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/set-password" element={<ResetPasswordPage welcome />} />
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
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/rfqs/new" element={<RequireCreateRfq><RFQCreatePage /></RequireCreateRfq>} />
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
