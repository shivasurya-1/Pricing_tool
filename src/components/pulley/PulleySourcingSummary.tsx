import type { RFQItem } from '@/types'
import { BOUGHT_OUT_COMPONENTS, PROCESS_SOURCING_MAP } from '@/data/pulleyTechDataSchema'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { useFormulaStore } from '@/store/formulaStore'
import { formatCurrency } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'

/** Read-only per-item component + process sourcing breakdown — what Sourcing reviewed and
 * confirmed, for RFQDetailPage and ApprovalScreen's Sourcing tabs. */
export function PulleySourcingSummary({ item }: { item: RFQItem }) {
  // Subscribing (not just reading) so a formula saved on the Formulas page re-renders
  // this component immediately instead of only on the next unrelated re-render.
  useFormulaStore((s) => s.formulas)
  useFormulaStore((s) => s.costRates)
  const values = item.technicalData
  if (!values) return <p className="text-sm text-[var(--color-ink-faint)]">No technical data captured for this item.</p>

  const pricing = computePulleyPricing(values)
  const lineByKey = (key?: string) => (key ? [...pricing.sectionC, ...pricing.sectionD].find((l) => l.key === key) : undefined)
  const vendorFor = (processKey: string) => item.processVendors?.find((p) => p.processKey === processKey)

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{item.productName}</p>
        {item.sourcingConfirmed ? <Badge tone="green">Sourcing Confirmed</Badge> : <Badge tone="amber">Not Yet Confirmed</Badge>}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Bought-Out Components</p>
        <table className="w-full min-w-[500px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
              <th className="px-2 py-1.5">Component</th>
              <th className="px-2 py-1.5">Designation</th>
              <th className="px-2 py-1.5 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {BOUGHT_OUT_COMPONENTS.map((c) => (
              <tr key={c.key} className="border-b border-[var(--color-border)]">
                <td className="px-2 py-1.5 font-medium">{c.label}</td>
                <td className="px-2 py-1.5">{String(values[c.designationKey] ?? '—')}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatCurrency(Number(values[c.priceKey]) || 0)}
                  {c.priceUnit && <span className="text-[var(--color-ink-faint)]">{c.priceUnit}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">In-House / Outsource Processes</p>
        <table className="w-full min-w-[500px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
              <th className="px-2 py-1.5">Process</th>
              <th className="px-2 py-1.5">Mode</th>
              <th className="px-2 py-1.5">Vendor</th>
              <th className="px-2 py-1.5 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {PROCESS_SOURCING_MAP.map((p) => {
              const mode = String(values[p.srcKey] ?? '—')
              const line = mode === 'Outsource' ? lineByKey(p.dKey) : lineByKey(p.cKey)
              const vendor = vendorFor(p.srcKey)
              return (
                <tr key={p.srcKey} className="border-b border-[var(--color-border)]">
                  <td className="px-2 py-1.5 font-medium">{p.label}</td>
                  <td className="px-2 py-1.5">
                    <Badge tone={mode === 'In-house' ? 'teal' : mode === 'Outsource' ? 'purple' : 'blue'}>{mode}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-[var(--color-ink-faint)]">{vendor?.vendorName ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">{line ? formatCurrency(line.value) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-6 border-t border-[var(--color-border)] pt-2 text-xs">
        <span className="text-[var(--color-ink-faint)]">Total Direct Cost per Unit</span>
        <span className="font-semibold">{formatCurrency(pricing.totalDirectCostPerUnit)}</span>
      </div>
    </div>
  )
}
