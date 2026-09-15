import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { IN_HOUSE_HOURS_RATES } from '@/data/inHouseHoursRates'
import { formatCurrency } from '@/lib/format'

export function MhrLhrCalculatorPage() {
  return (
    <div>
      <PageHeader title="In-House Hours" description="Cost head rate lookup — mirrors the client's In-House Hours tab exactly." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Read-only reference. Each cost head's rate is applied to the Run + Setup time entered on the Technical Data Sheet for that operation.</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                <th className="px-4 py-2">Cost Head</th>
                <th className="px-4 py-2">Operation</th>
                <th className="px-4 py-2">Cost Centre</th>
                <th className="px-4 py-2">Activity Description</th>
                <th className="px-4 py-2 text-right">MHR Rate</th>
              </tr>
            </thead>
            <tbody>
              {IN_HOUSE_HOURS_RATES.map((row) => (
                <tr key={row.costHead} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{row.costHead}</td>
                  <td className="px-4 py-2.5">{row.operation}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-faint)]">{row.costCentre}</td>
                  <td className="px-4 py-2.5">{row.activityDescription}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(row.mhrRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
