import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'
import { LAGGING_CATALOG } from '@/data/pulleyCatalogs'
import { formatCurrency } from '@/lib/format'

const r = PULLEY_COST_RATES
const eur = (inr: number) => `€${(inr / r.exchangeRateEurToInr).toFixed(2)}`

const LABOUR_ROWS: { label: string; rateInr: number; sourcing: 'In-house' | 'Outsource' }[] = [
  { label: 'Lathe turning', rateInr: r.labourRatesInrPerHour.latheTurning, sourcing: 'In-house' },
  { label: 'Rolling / bending', rateInr: r.labourRatesInrPerHour.rollingBending, sourcing: 'In-house' },
  { label: 'Welding (MIG/MAG)', rateInr: r.labourRatesInrPerHour.weldingMigMag, sourcing: 'In-house' },
  { label: 'Grinding / finishing', rateInr: r.labourRatesInrPerHour.grindingFinishing, sourcing: 'In-house' },
  { label: 'Assembly labour', rateInr: r.labourRatesInrPerHour.assemblyLabour, sourcing: 'In-house' },
  { label: 'Engineering / design', rateInr: r.labourRatesInrPerHour.engineeringDesign, sourcing: 'In-house' },
  { label: 'Heat treatment / annealing (per kg)', rateInr: r.heatTreatmentInrPerKg, sourcing: 'Outsource' },
  { label: 'Stress relief (per kg)', rateInr: r.stressReliefInrPerKg, sourcing: 'Outsource' },
  { label: 'Balancing (per set)', rateInr: r.balancingInrPerSet, sourcing: 'In-house' },
  { label: 'Painting / surface prep (per m²)', rateInr: r.labourRatesInrPerHour.paintingSurfacePrep, sourcing: 'In-house' },
  { label: 'Machining body – outsourced (per kg)', rateInr: r.machiningOutsourcedInrPerKg, sourcing: 'Outsource' },
]

export function CostRateTablesPage() {
  return (
    <div>
      <PageHeader title="Cost Rate Tables" description="The rate card behind the Pricing Tool — mirrors the client's Cost Rate Tables tab exactly." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Read-only in this prototype — every Pricing Tool calculation reads from these values. Editing comes with the backend phase.</p>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="A. Global Parameters" />
          <SimpleTable
            headers={['Parameter', 'Value', 'Unit']}
            rows={[
              ['Exchange Rate EUR → INR', String(r.exchangeRateEurToInr), 'INR/EUR'],
              ['GST Rate', `${(r.gstRate * 100).toFixed(0)}%`, ''],
              ['OEM Discount', `${(r.oemDiscount * 100).toFixed(0)}%`, ''],
              ['Price Factor HK0 (markup)', `${r.priceFactorMarkup}×`, ''],
              ['Delivery Safety Factor', `${r.deliverySafetyFactor}×`, ''],
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="B. Material Rates" description="INR/kg — same figures as Raw Forging Prices, kept in sync" />
          <SimpleTable
            headers={['Material', 'INR/kg', 'EUR/kg']}
            rows={[
              ['Disc plate / hub (IS 2062 E350)', formatCurrency(r.rawForgingRates.endDiscInrPerKg), eur(r.rawForgingRates.endDiscInrPerKg)],
              ['Shell plate IS 2062 E350', formatCurrency(r.rawForgingRates.shellPlateInrPerKg), eur(r.rawForgingRates.shellPlateInrPerKg)],
              ['Shaft – C45 round bar', formatCurrency(r.rawForgingRates.shaftC45InrPerKg), eur(r.rawForgingRates.shaftC45InrPerKg)],
              ['Shaft – 42CrMo4 alloy steel forged', formatCurrency(r.rawForgingRates.shaft42CrMo4InrPerKg), eur(r.rawForgingRates.shaft42CrMo4InrPerKg)],
              ['Weld consumables (per kg pulley)', formatCurrency(r.weldConsumablesInrPerKgPulley), eur(r.weldConsumablesInrPerKgPulley)],
              ['Grease (per kg pulley)', formatCurrency(r.greaseInrPerKgPulley), eur(r.greaseInrPerKgPulley)],
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="C. Machining & Labour Rates" description="INR/hour unless noted" />
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                <th className="px-4 py-2">Operation</th>
                <th className="px-4 py-2 text-right">INR/h</th>
                <th className="px-4 py-2 text-right">EUR/h</th>
                <th className="px-4 py-2">Sourcing Default</th>
              </tr>
            </thead>
            <tbody>
              {LABOUR_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{row.label}</td>
                  <td className="px-4 py-2.5 text-right">{formatCurrency(row.rateInr)}</td>
                  <td className="px-4 py-2.5 text-right">{eur(row.rateInr)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={row.sourcing === 'In-house' ? 'teal' : 'purple'}>{row.sourcing}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="D. Lagging Rates" description="INR/m²" />
          <SimpleTable
            headers={['Lagging Type', 'Thickness (mm)', 'INR/m²', 'Lead Time (days)']}
            rows={LAGGING_CATALOG.map((l) => [l.laggingType, String(l.thicknessMm), formatCurrency(l.priceInrPerM2), String(l.deliveryDays)])}
          />
        </Card>

        <Card>
          <CardHeader title="E. Logistics & Packing Rates" />
          <SimpleTable
            headers={['Item', 'Rate', 'Unit']}
            rows={[
              ['Inbound freight – shaft', formatCurrency(r.logistics.inboundFreightShaftPerKg), 'INR/kg'],
              ['Inbound freight – plates', formatCurrency(r.logistics.inboundFreightPlatesPerKg), 'INR/kg'],
              ['Inbound freight – purchased parts', formatCurrency(r.logistics.inboundFreightPurchasedPartsPerOrder), 'INR/order'],
              ['Packing – wood crate', formatCurrency(r.logistics.packingWoodCratePer100kg), 'INR/100kg'],
              ['Outbound shipping FOB', formatCurrency(r.logistics.outboundShippingFobPerKg), 'INR/kg'],
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
          {headers.map((h) => (
            <th key={h} className="px-4 py-2">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
            {row.map((cell, j) => (
              <td key={j} className={`px-4 py-2.5 ${j === 0 ? 'font-medium' : ''} ${j > 0 ? 'text-right' : ''}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
