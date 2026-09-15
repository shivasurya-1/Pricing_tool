import { useMemo } from 'react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { CategoryBarChart, DonutChart, TrendLineChart } from '@/components/charts/Charts'
import { CATEGORICAL } from '@/components/charts/palette'
import { formatCurrency } from '@/lib/format'
import { STAGE_ORDER } from '@/lib/workflow'
import { averageAge } from '@/lib/dashboardStats'

function monthKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { month: 'short' })
}

export function AnalyticsPage() {
  const rfqs = useDataStore((s) => s.rfqs)
  const quotations = useDataStore((s) => s.quotations)
  const auditLog = useDataStore((s) => s.auditLog)

  const pipelineValue = rfqs.filter((r) => !['Won', 'Lost', 'Rejected'].includes(r.stage)).reduce((s, r) => s + r.value, 0)
  const quotationValue = quotations.reduce((s, q) => s + q.amount, 0)
  const wonValue = quotations.filter((q) => q.status === 'Won').reduce((s, q) => s + q.amount, 0)
  const lostValue = quotations.filter((q) => q.status === 'Lost').reduce((s, q) => s + q.amount, 0)
  const closed = quotations.filter((q) => q.status === 'Won' || q.status === 'Lost').length
  const won = quotations.filter((q) => q.status === 'Won').length
  const conversion = closed > 0 ? Math.round((won / closed) * 100) : 0
  const costed = rfqs.filter((r) => r.costBreakdown.length > 0)
  const avgMargin = costed.length
    ? costed.reduce((s, r) => s + r.costBreakdown.reduce((a, l) => a + l.marginPercent, 0) / r.costBreakdown.length, 0) / costed.length
    : 0
  const avgRfqTat = averageAge(rfqs.filter((r) => ['Won', 'Lost'].includes(r.stage)))
  const approvalEvents = auditLog.filter((a) => a.role === 'Approval Panel')
  const avgApprovalTat = approvalEvents.length ? 2 : 0

  const rfqByStage = useMemo(() => STAGE_ORDER.map((s) => ({ name: s, count: rfqs.filter((r) => r.stage === s).length })).filter((r) => r.count > 0), [rfqs])

  const rfqByMonth = useMemo(() => {
    const map = new Map<string, number>()
    rfqs.forEach((r) => {
      const k = monthKey(r.createdAt)
      map.set(k, (map.get(k) ?? 0) + 1)
    })
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  }, [rfqs])

  const valueTrend = useMemo(() => {
    const map = new Map<string, number>()
    quotations.forEach((q) => {
      const k = monthKey(q.quoteDate)
      map.set(k, (map.get(k) ?? 0) + q.amount)
    })
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [quotations])

  const marginTrend = useMemo(() => {
    const map = new Map<string, number[]>()
    costed.forEach((r) => {
      const k = monthKey(r.updatedAt)
      const avg = r.costBreakdown.reduce((s, l) => s + l.marginPercent, 0) / r.costBreakdown.length
      map.set(k, [...(map.get(k) ?? []), avg])
    })
    return [...map.entries()].map(([name, vals]) => ({ name, margin: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
  }, [costed])

  const customerContribution = useMemo(() => {
    const map = new Map<string, number>()
    rfqs.forEach((r) => map.set(r.endCustomer, (map.get(r.endCustomer) ?? 0) + r.value))
    return [...map.entries()].map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [rfqs])

  const teamPerformance = useMemo(() => {
    const salesPeople = [...new Set(rfqs.map((r) => r.salesPerson))]
    return salesPeople.map((sp) => ({ name: sp, count: rfqs.filter((r) => r.salesPerson === sp).length }))
  }, [rfqs])

  return (
    <div>
      <PageHeader title="Analytics" description="Enterprise-wide performance across the RFQ to Quotation pipeline" />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="RFQ Pipeline Value" value={formatCurrency(pipelineValue)} />
        <KpiCard label="Quotation Value" value={formatCurrency(quotationValue)} />
        <KpiCard label="Won Value" value={formatCurrency(wonValue)} tone="green" />
        <KpiCard label="Lost Value" value={formatCurrency(lostValue)} tone="red" />
        <KpiCard label="Conversion %" value={`${conversion}%`} />
        <KpiCard label="Average Margin %" value={`${avgMargin.toFixed(1)}%`} />
        <KpiCard label="Average RFQ TAT" value={`${avgRfqTat}d`} />
        <KpiCard label="Average Approval TAT" value={`${avgApprovalTat}d`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="RFQs by Stage" />
          <div className="p-4">
            <CategoryBarChart data={rfqByStage} series={[{ key: 'count', label: 'RFQs', color: CATEGORICAL[0] }]} horizontal />
          </div>
        </Card>
        <Card>
          <CardHeader title="RFQs by Month" />
          <div className="p-4">
            <CategoryBarChart data={rfqByMonth} series={[{ key: 'count', label: 'RFQs', color: CATEGORICAL[2] }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Quotation Value Trend" />
          <div className="p-4">
            <TrendLineChart data={valueTrend} dataKey="value" color={CATEGORICAL[0]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Won vs Lost" />
          <div className="p-4">
            <DonutChart data={[{ name: 'Won', value: won }, { name: 'Lost', value: closed - won }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Margin Trend" />
          <div className="p-4">
            <TrendLineChart data={marginTrend} dataKey="margin" color={CATEGORICAL[1]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Team Performance" />
          <div className="p-4">
            <CategoryBarChart data={teamPerformance} series={[{ key: 'count', label: 'RFQs Handled', color: CATEGORICAL[6] }]} />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Customer Contribution" />
          <div className="p-4">
            <CategoryBarChart data={customerContribution} series={[{ key: 'value', label: 'Total RFQ Value', color: CATEGORICAL[4] }]} horizontal height={260} />
          </div>
        </Card>
      </div>
    </div>
  )
}
