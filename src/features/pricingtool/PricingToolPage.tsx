import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore } from '@/store/formulaStore'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { computePulleyPricing, type CostLine } from '@/lib/pulleyPricingCalc'
import { formatCurrency } from '@/lib/format'
import type { RFQItem } from '@/types'

const SECTION_LABELS: { key: 'sectionA' | 'sectionB' | 'sectionC' | 'sectionD' | 'sectionE'; title: string; totalKey: 'totalA' | 'totalB' | 'totalC' | 'totalD' | 'totalE' }[] = [
  { key: 'sectionA', title: 'SECTION A — RAW MATERIALS COST', totalKey: 'totalA' },
  { key: 'sectionB', title: 'SECTION B — ANCILLARY PARTS', totalKey: 'totalB' },
  { key: 'sectionC', title: 'SECTION C — IN-HOUSE PROCESSING COST', totalKey: 'totalC' },
  { key: 'sectionD', title: 'SECTION D — OUTSOURCED PROCESSING COST', totalKey: 'totalD' },
  { key: 'sectionE', title: 'SECTION E — PACKING & SHIPMENT COST', totalKey: 'totalE' },
]

export function PricingToolPage() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const rfqsWithTechData = useMemo(() => rfqs.filter((r) => r.items.some((it) => isTechDataFilled(it.technicalData))), [rfqs])

  const [rfqId, setRfqId] = useState(rfqsWithTechData[0]?.id ?? '')
  const rfq = rfqs.find((r) => r.id === rfqId)

  const items = useMemo(() => (rfq ? rfq.items.filter((it) => isTechDataFilled(it.technicalData)) : []), [rfq])
  // Subscribed so a formula saved on the Formulas page recomputes this page immediately,
  // instead of only refreshing the next time `items` happens to change.
  const formulas = useFormulaStore((s) => s.formulas)
  const costRates = useFormulaStore((s) => s.costRates)
  const results = useMemo(
    () => items.map((it) => ({ item: it, pricing: computePulleyPricing(it.technicalData ?? {}) })),
    [items, formulas, costRates],
  )

  return (
    <div>
      <PageHeader
        title="Pricing Tool"
        description="Computed cost buildup from each item's Technical Data Sheet — mirrors the client's Pricing Tool tab (Sections A-F)."
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="text-xs font-medium text-[var(--color-ink-soft)]">RFQ</label>
          <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">Select an RFQ with technical data...</option>
            {rfqsWithTechData.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfqNumber} — {r.endCustomer}
              </option>
            ))}
          </select>
          {rfq && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/rfqs/${rfq.id}`)}>
              Open RFQ
            </Button>
          )}
        </div>
      </Card>

      {!rfq ? (
        <EmptyState
          title="No RFQ selected"
          description={
            rfqsWithTechData.length === 0
              ? 'No RFQ has captured technical data yet. Fill "Technical Data" on an item while creating an RFQ, then come back here.'
              : 'Pick an RFQ above to see its computed pricing.'
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No items with technical data on this RFQ" />
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-4 py-3 text-sm text-[var(--color-amber)]">
            <Info size={15} className="mt-0.5 shrink-0" />
            <p>
              Section C is costed from Section 9 (In-House Processing Hours) on the item's Technical Data Sheet — Run + Setup minutes x
              that operation's hourly rate. Rows marked <strong>Pending</strong> just need hours entered; everything else uses the real
              Cost Rate Tables values and component catalogs from the sample workbook.
            </p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[280px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                      Cost Element
                    </th>
                    {results.map(({ item }) => (
                      <th key={item.id} className="min-w-[160px] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left font-semibold text-[var(--color-ink)]">
                        {item.productName || 'Pulley'}
                        <p className="text-xs font-normal text-[var(--color-ink-faint)]">Qty: {item.quantity}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SECTION_LABELS.map((section) => (
                    <Fragment key={section.key}>
                      <tr>
                        <td
                          colSpan={results.length + 1}
                          className="sticky left-0 border-b border-t border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]"
                        >
                          {section.title}
                        </td>
                      </tr>
                      {results[0]?.pricing[section.key].map((_: CostLine, lineIdx: number) => (
                        <tr key={section.key + lineIdx} className="border-b border-[var(--color-border)]">
                          <td className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-white px-3 py-2">
                            {results[0].pricing[section.key][lineIdx].label}
                          </td>
                          {results.map(({ item, pricing }) => {
                            const line = pricing[section.key][lineIdx]
                            return (
                              <td key={item.id} className="px-3 py-2 text-right">
                                {line.pending ? <Badge tone="amber">Pending</Badge> : formatCurrency(line.value)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-surface)] font-semibold">
                        <td className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                          Total {section.title.split('—')[0].trim()}
                        </td>
                        {results.map(({ item, pricing }) => (
                          <td key={item.id} className="px-3 py-2 text-right">
                            {formatCurrency(pricing[section.totalKey])}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  ))}

                  <tr>
                    <td
                      colSpan={results.length + 1}
                      className="sticky left-0 border-b border-t border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]"
                    >
                      Section F — Cost Summary &amp; Pricing
                    </td>
                  </tr>
                  <SummaryRow label="Total Weight of the Pulley" results={results} pick={() => 0} unit="kg" pickRaw={(item) => Number(item.technicalData?.totalPulleyMass) || 0} />
                  <SummaryRow label="Total Direct Cost (A+B+C+D+E) — per unit" results={results} pick={(p) => p.totalDirectCostPerUnit} />
                  <SummaryRow label="Total Direct Cost x Qty — INR" results={results} pick={(p) => p.totalDirectCost} bold />
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function SummaryRow({
  label,
  results,
  pick,
  pickRaw,
  bold,
  percent,
  currency,
  unit,
}: {
  label: string
  results: { item: RFQItem; pricing: ReturnType<typeof computePulleyPricing> }[]
  pick: (p: ReturnType<typeof computePulleyPricing>) => number
  /** Reads a plain value straight off the item instead of the computed pricing (e.g. weight). */
  pickRaw?: (item: RFQItem) => number
  bold?: boolean
  percent?: boolean
  currency?: string
  unit?: string
}) {
  return (
    <tr className={clsx('border-b border-[var(--color-border)]', bold && 'font-semibold')}>
      <td className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-white px-3 py-2">{label}</td>
      {results.map(({ item, pricing }) => {
        const value = pickRaw ? pickRaw(item) : pick(pricing)
        return (
          <td key={item.id} className="px-3 py-2 text-right">
            {percent ? `${value.toFixed(1)}%` : unit ? `${value.toLocaleString('en-IN')} ${unit}` : formatCurrency(value, currency)}
          </td>
        )
      })}
    </tr>
  )
}
