import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { ActionQueueTable } from '@/components/ActionQueueTable'
import { CategoryBarChart, DonutChart } from '@/components/charts/Charts'
import { CATEGORICAL } from '@/components/charts/palette'
import { countStage, countStages, sortByAgeDesc } from '@/lib/dashboardStats'
import { marginStatus, summarizeCostBreakdown } from '@/lib/pricing'
import { formatCurrency } from '@/lib/format'

export function ControllingDashboard() {
  const rfqs = useDataStore((s) => s.rfqs)
  const products = useDataStore((s) => s.products)

  const pending = rfqs.filter((r) => r.stage === 'Controlling')
  const costed = rfqs.filter((r) => r.costBreakdown.length > 0)
  const highValue = rfqs.filter((r) => r.value > 600000)
  const belowMargin = costed.filter((r) => {
    const summary = summarizeCostBreakdown(r.costBreakdown)
    return marginStatus(summary.marginPercent, r.targetMarginPercent) === 'below'
  })
  const readyForApproval = countStage(rfqs, 'Approval Pending')
  const completed = countStages(rfqs, ['Approved', 'Quotation Generated', 'Quotation Sent', 'Won', 'Lost'])

  const marginByCategory = useMemo(() => {
    const categories = [...new Set(products.map((p) => p.category))]
    return categories.map((cat) => {
      const catProducts = products.filter((p) => p.category === cat).map((p) => p.id)
      const lines = costed.flatMap((r) => r.costBreakdown.filter((l) => catProducts.includes(r.items.find((i) => i.id === l.itemId)?.productId ?? '')))
      const avg = lines.length ? lines.reduce((s, l) => s + l.marginPercent, 0) / lines.length : 0
      return { name: cat, margin: Math.round(avg * 10) / 10 }
    })
  }, [costed, products])

  const marginBuckets = useMemo(() => {
    let healthy = 0, warning = 0, below = 0
    costed.forEach((r) => {
      const summary = summarizeCostBreakdown(r.costBreakdown)
      const status = marginStatus(summary.marginPercent, r.targetMarginPercent)
      if (status === 'healthy') healthy++
      else if (status === 'warning') warning++
      else below++
    })
    return [
      { name: 'Healthy', value: healthy },
      { name: 'Warning', value: warning },
      { name: 'Below Target', value: below },
    ]
  }, [costed])

  const totalQuotationValue = costed.reduce((s, r) => s + r.value, 0)

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Pending Costing" value={pending.length} />
        <KpiCard label="High Value" value={highValue.length} />
        <KpiCard label="Low Margin" value={belowMargin.length} tone={belowMargin.length > 0 ? 'red' : 'neutral'} />
        <KpiCard label="Ready for Approval" value={readyForApproval} tone="green" />
        <KpiCard label="Completed" value={completed} />
      </div>

      {belowMargin.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--color-red-100)] bg-[var(--color-red-50)] px-4 py-3 text-sm text-[var(--color-red)]">
          <AlertTriangle size={16} />
          <span className="font-medium">{belowMargin.length} quotation{belowMargin.length > 1 ? 's are' : ' is'} below target margin.</span>
        </div>
      )}

      <Card data-tour="primary-table">
        <CardHeader
          title="Pending Commercial Calculations"
          description={`Total value in queue: ${formatCurrency(pending.reduce((s, r) => s + r.value, 0))}`}
        />
        <ActionQueueTable rfqs={sortByAgeDesc(pending)} actionLabel="Calculate" emptyTitle="No pending costing" emptyDescription="Nothing waiting for commercial calculation." />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Average Margin by Category" />
          <div className="p-4">
            <CategoryBarChart data={marginByCategory} series={[{ key: 'margin', label: 'Avg Margin %', color: CATEGORICAL[1] }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Margin Distribution" description={`Total quotation value: ${formatCurrency(totalQuotationValue)}`} />
          <div className="p-4">
            <DonutChart data={marginBuckets} />
          </div>
        </Card>
      </div>
    </div>
  )
}
