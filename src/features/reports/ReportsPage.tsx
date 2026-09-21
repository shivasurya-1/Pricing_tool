import { useMemo, useState } from 'react'
import { Download, LayoutGrid, Table2 } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CategoryBarChart, DonutChart } from '@/components/charts/Charts'
import { CATEGORICAL } from '@/components/charts/palette'
import { formatCurrency } from '@/lib/format'
import { downloadCsv } from '@/lib/csv'
import { STAGE_ORDER } from '@/lib/workflow'

function ToggleView({ mode, onChange }: { mode: 'chart' | 'table'; onChange: (m: 'chart' | 'table') => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]">
      <button onClick={() => onChange('chart')} className={`p-1.5 ${mode === 'chart' ? 'bg-[var(--color-blue-50)] text-[var(--color-blue)]' : 'text-[var(--color-ink-faint)]'}`}>
        <LayoutGrid size={14} />
      </button>
      <button onClick={() => onChange('table')} className={`p-1.5 ${mode === 'table' ? 'bg-[var(--color-blue-50)] text-[var(--color-blue)]' : 'text-[var(--color-ink-faint)]'}`}>
        <Table2 size={14} />
      </button>
    </div>
  )
}

function SimpleTable({ rows }: { rows: { name: string; value: string | number }[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-[var(--color-border)] last:border-0">
            <td className="px-4 py-2 text-[var(--color-ink-soft)]">{r.name}</td>
            <td className="px-4 py-2 text-right font-medium">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ReportsPage() {
  const rfqs = useDataStore((s) => s.rfqs)
  const quotations = useDataStore((s) => s.quotations)
  const auditLog = useDataStore((s) => s.auditLog)
  const pushToast = useUiStore((s) => s.pushToast)

  const [rfqView, setRfqView] = useState<'chart' | 'table'>('chart')
  const [quoteView, setQuoteView] = useState<'chart' | 'table'>('chart')
  const [priceView, setPriceView] = useState<'chart' | 'table'>('chart')
  const [teamView, setTeamView] = useState<'chart' | 'table'>('chart')

  const rfqByStatus = useMemo(() => STAGE_ORDER.map((s) => ({ name: s, value: rfqs.filter((r) => r.stage === s).length })).filter((r) => r.value > 0), [rfqs])
  const rfqBySales = useMemo(() => {
    const map = new Map<string, number>()
    rfqs.forEach((r) => map.set(r.salesPerson, (map.get(r.salesPerson) ?? 0) + 1))
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [rfqs])

  const quotesByStatus = useMemo(() => {
    const map = new Map<string, number>()
    quotations.forEach((q) => map.set(q.status, (map.get(q.status) ?? 0) + 1))
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [quotations])

  const marginByCustomer = useMemo(() => {
    const map = new Map<string, number[]>()
    rfqs.filter((r) => r.costBreakdown.length > 0).forEach((r) => {
      const avg = r.costBreakdown.reduce((s, l) => s + l.marginPercent, 0) / r.costBreakdown.length
      map.set(r.endCustomer, [...(map.get(r.endCustomer) ?? []), avg])
    })
    return [...map.entries()].map(([name, vals]) => ({ name, margin: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 }))
  }, [rfqs])

  const teamPerformance = useMemo(() => {
    const salesPeople = [...new Set(rfqs.map((r) => r.salesPerson))]
    return salesPeople.map((sp) => ({
      name: sp,
      handled: rfqs.filter((r) => r.salesPerson === sp).length,
      won: rfqs.filter((r) => r.salesPerson === sp && r.stage === 'Won').length,
    }))
  }, [rfqs])

  const exportCsv = () => {
    const rows: (string | number)[][] = []
    const section = (title: string, data: { name: string; value: string | number }[]) => {
      rows.push([title])
      rows.push(...data.map((d) => [d.name, d.value]))
      rows.push([])
    }
    section('RFQ by Status', rfqByStatus)
    section('RFQ by Sales Person', rfqBySales)
    section('Quotations by Status', quotesByStatus)
    section('Avg Margin % by Customer', marginByCustomer.map((m) => ({ name: m.name, value: m.margin })))
    section('Team Performance', teamPerformance.map((t) => ({ name: t.name, value: `${t.handled} handled, ${t.won} won` })))
    section('Audit Summary', [
      { name: 'Total audit events', value: auditLog.length },
      { name: 'Approvals recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('approv')).length },
      { name: 'Rejections recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('reject')).length },
      { name: 'Send-backs recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('sent back')).length },
      { name: 'Total value quoted', value: formatCurrency(quotations.reduce((s, q) => s + q.amount, 0)) },
    ])
    downloadCsv('reports.csv', ['Metric', 'Value'], rows)
    pushToast('Report exported.', 'success')
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Operational reporting across RFQs, quotations, pricing and team performance"
        actions={
          <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>
            Export
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <select className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option>Last 90 days</option>
            <option>Last 30 days</option>
            <option>This year</option>
          </select>
          <select className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option>All Teams</option>
            <option>Sales</option>
            <option>Operations</option>
            <option>Sourcing</option>
            <option>Controlling</option>
          </select>
          <select className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option>All Customers</option>
            {[...new Set(rfqs.map((r) => r.endCustomer))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="RFQ Report" description="By status and by sales person" action={<ToggleView mode={rfqView} onChange={setRfqView} />} />
          <div className="p-4">
            {rfqView === 'chart' ? (
              <CategoryBarChart data={rfqByStatus} series={[{ key: 'value', label: 'RFQs', color: CATEGORICAL[0] }]} horizontal />
            ) : (
              <SimpleTable rows={rfqBySales} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Quotation Report" description="By status" action={<ToggleView mode={quoteView} onChange={setQuoteView} />} />
          <div className="p-4">{quoteView === 'chart' ? <DonutChart data={quotesByStatus} /> : <SimpleTable rows={quotesByStatus} />}</div>
        </Card>

        <Card>
          <CardHeader title="Pricing Report" description="Average margin by customer" action={<ToggleView mode={priceView} onChange={setPriceView} />} />
          <div className="p-4">
            {priceView === 'chart' ? (
              <CategoryBarChart data={marginByCustomer} series={[{ key: 'margin', label: 'Avg Margin %', color: CATEGORICAL[1] }]} horizontal />
            ) : (
              <SimpleTable rows={marginByCustomer.map((m) => ({ name: m.name, value: `${m.margin}%` }))} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Team Performance" description="RFQs handled and won by sales person" action={<ToggleView mode={teamView} onChange={setTeamView} />} />
          <div className="p-4">
            {teamView === 'chart' ? (
              <CategoryBarChart
                data={teamPerformance}
                series={[
                  { key: 'handled', label: 'Handled', color: CATEGORICAL[0] },
                  { key: 'won', label: 'Won', color: CATEGORICAL[5] },
                ]}
              />
            ) : (
              <SimpleTable rows={teamPerformance.map((t) => ({ name: t.name, value: `${t.handled} handled · ${t.won} won` }))} />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Audit Report" description="All activities, approvals and changes" />
          <div className="p-4">
            <SimpleTable
              rows={[
                { name: 'Total audit events', value: auditLog.length },
                { name: 'Approvals recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('approv')).length },
                { name: 'Rejections recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('reject')).length },
                { name: 'Send-backs recorded', value: auditLog.filter((a) => a.action.toLowerCase().includes('sent back')).length },
                { name: 'Total value quoted', value: formatCurrency(quotations.reduce((s, q) => s + q.amount, 0)) },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
