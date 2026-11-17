import { useMemo } from 'react'
import { useDataStore } from '@/store/dataStore'
import { KpiCard } from '@/components/KpiCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { ActionQueueTable } from '@/components/ActionQueueTable'
import { CategoryBarChart } from '@/components/charts/Charts'
import { CATEGORICAL } from '@/components/charts/palette'
import { countStages, isOverdue, sortByAgeDesc, stageAge } from '@/lib/dashboardStats'
import { STAGE_ORDER } from '@/lib/workflow'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { useFormulaStore } from '@/store/formulaStore'
import { PROCESS_SOURCING_MAP } from '@/data/pulleyTechDataSchema'

export function SourcingDashboard() {
  const rfqs = useDataStore((s) => s.rfqs)
  // Subscribed so these charts recompute immediately when a formula is saved.
  const formulas = useFormulaStore((s) => s.formulas)
  const costRates = useFormulaStore((s) => s.costRates)

  const atSourcing = rfqs.filter((r) => r.stage === 'Sourcing')
  const awaiting = atSourcing.filter((r) => stageAge(r) <= 1)
  const inProgress = atSourcing.filter((r) => stageAge(r) > 1 && !isOverdue(r, 5))
  const overdue = atSourcing.filter((r) => isOverdue(r, 5))
  const bestPriceCompleted = countStages(rfqs, ['Controlling', 'Approval Pending', 'Approved', 'Quotation Generated', 'Quotation Sent', 'Won', 'Lost'])
  const itemsPendingConfirmation = atSourcing.reduce((sum, r) => sum + r.items.filter((i) => !i.sourcingConfirmed).length, 0)

  const reachedSourcing = useMemo(() => rfqs.filter((r) => STAGE_ORDER.indexOf(r.stage) >= STAGE_ORDER.indexOf('Sourcing')), [rfqs])

  const outsourcedCostByProcess = useMemo(() => {
    const map = new Map<string, number[]>()
    reachedSourcing.forEach((r) => {
      r.items.forEach((item) => {
        const pricing = computePulleyPricing(item.technicalData ?? {})
        PROCESS_SOURCING_MAP.forEach((p) => {
          if (!p.dKey || item.technicalData?.[p.srcKey] !== 'Outsource') return
          const line = pricing.sectionD.find((l) => l.key === p.dKey)
          if (line && line.value > 0) map.set(p.label, [...(map.get(p.label) ?? []), line.value])
        })
      })
    })
    return [...map.entries()].map(([name, vals]) => ({
      name,
      avgCost: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
    }))
  }, [reachedSourcing, formulas, costRates])

  const costSplitByRfq = useMemo(() => {
    return reachedSourcing
      .map((r) => {
        let inHouse = 0
        let outsourced = 0
        r.items.forEach((item) => {
          const p = computePulleyPricing(item.technicalData ?? {})
          const qty = p.qty || 1
          inHouse += p.totalC * qty
          outsourced += p.totalD * qty
        })
        return { name: r.rfqNumber, inHouse: Math.round(inHouse), outsourced: Math.round(outsourced) }
      })
      .filter((r) => r.inHouse + r.outsourced > 0)
      .sort((a, b) => b.inHouse + b.outsourced - (a.inHouse + a.outsourced))
      .slice(0, 6)
  }, [reachedSourcing, formulas, costRates])

  return (
    <div className="space-y-5">
      <div data-tour="kpi-row" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Awaiting Sourcing" value={awaiting.length} />
        <KpiCard label="In Progress" value={inProgress.length} />
        <KpiCard label="Items Pending Confirmation" value={itemsPendingConfirmation} />
        <KpiCard label="Best Price Completed" value={bestPriceCompleted} tone="green" />
        <KpiCard label="Overdue" value={overdue.length} tone="red" />
      </div>

      <Card data-tour="primary-table">
        <CardHeader title="Sourcing Activity" description="RFQs awaiting component & process sourcing review" />
        <ActionQueueTable rfqs={sortByAgeDesc(atSourcing)} actionLabel="Review Sourcing" emptyTitle="No sourcing tasks" emptyDescription="Nothing awaiting sourcing review." />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Outsourced Cost by Process" description="Average cost of each process when sent to a vendor" />
          <div className="p-4">
            <CategoryBarChart data={outsourcedCostByProcess} series={[{ key: 'avgCost', label: 'Avg Outsourced Cost', color: CATEGORICAL[2] }]} horizontal />
          </div>
        </Card>
        <Card>
          <CardHeader title="In-House vs Outsourced Cost Split" description="Make-vs-buy balance across recent RFQs" />
          <div className="p-4">
            <CategoryBarChart
              data={costSplitByRfq}
              series={[
                { key: 'inHouse', label: 'In-House', color: CATEGORICAL[2] },
                { key: 'outsourced', label: 'Outsourced', color: CATEGORICAL[5] },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
