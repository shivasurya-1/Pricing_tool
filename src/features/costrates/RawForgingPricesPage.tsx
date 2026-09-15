import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const SHAFT_ROWS = [
  { material: 'C45', diameter: 'Ø 80 – 180', length: '2000 – 3000', asForged: 'Rs 175 – 225', rate410: '310', rate420_800: '?' },
  { material: '42CrMo4+QT', diameter: 'Ø 200 – 880', length: '2300 – 7300', asForged: 'Rs 190 – 240', rate410: '330', rate420_800: '?', note: 'Fully M/C' },
  {
    material: '30CrNiMo8+QT / 36CrNiMo4+QT / 34CrNiMo6+QT',
    diameter: 'Ø 300 – 450',
    length: '2300 – 7300',
    asForged: 'As per RFQ',
    rate410: 'Need Basis',
    rate420_800: '?',
  },
]

const SHELL_ROWS = [
  {
    sourcing: 'Outsourced' as const,
    diameterBody: '300 – ≤500',
    faceWidth: '800 – 1200',
    wallThickness: '10 – 12',
    weldedPlateThickness: '50 – 80',
    tBottomThickness: '—',
    rateEndPlate: '—',
    rateSheet: 'Rs 135 – 140',
    plateRate: '???',
    hubRate: '???',
  },
  {
    sourcing: 'In-house' as const,
    diameterBody: '>550 – 1000',
    faceWidth: '1200 – 2500',
    wallThickness: '15 – 40',
    weldedPlateThickness: '50 – 90',
    tBottomThickness: '100 – 150',
    rateEndPlate: 'Rs 195 – 210',
    rateSheet: 'Rs 95 – 110',
    plateRate: '110',
    hubRate: '210',
  },
  {
    sourcing: 'In-house' as const,
    diameterBody: '1000 – 1500',
    faceWidth: '1500 – 2500',
    wallThickness: '20 – 40',
    weldedPlateThickness: '—',
    tBottomThickness: '100 – 200',
    rateEndPlate: 'Rs 195 – 210',
    rateSheet: 'Rs 95 – 110',
    plateRate: '110',
    hubRate: '210',
  },
  {
    sourcing: 'In-house' as const,
    diameterBody: '1500 – 2000',
    faceWidth: '1500 – 2500',
    wallThickness: '20 – 40',
    weldedPlateThickness: '—',
    tBottomThickness: '100 – 200',
    rateEndPlate: 'Rs 195 – 210',
    rateSheet: 'Rs 135 – 145',
    plateRate: '130',
    hubRate: '210',
  },
  {
    sourcing: 'In-house' as const,
    diameterBody: '>2000',
    faceWidth: '1500 – 2500',
    wallThickness: '20 – 40',
    weldedPlateThickness: '—',
    tBottomThickness: '100 – 200',
    rateEndPlate: '—',
    rateSheet: 'As per RFQ',
    plateRate: '—',
    hubRate: '210',
  },
]

export function RawForgingPricesPage() {
  return (
    <div>
      <PageHeader title="Raw Forging Prices" description="Shaft and shell raw material rate bands by size — mirrors the client's Raw Forging Prices tab exactly." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Reference data, values shown exactly as supplied (including "???" and "As per RFQ" placeholders — the client's own sheet has
          gaps here). Note: the source workbook's own Pricing Tool formulas don't actually match a pulley to its size band either — they
          always use one fixed rate (Shell ₹110/kg, End Disc/Hub ₹210/kg, from the highlighted row below) for every model, and pick the
          shaft rate by material grade only (₹310 for C45, ₹330 for 42CrMo4+QT), not by size. This app's Pricing Tool matches that exactly.
        </p>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Shaft — with Full Machined Scope" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                  <th className="px-4 py-2">Material</th>
                  <th className="px-4 py-2">Diameter</th>
                  <th className="px-4 py-2">Length (mm)</th>
                  <th className="px-4 py-2">As-Forged (₹/kg)</th>
                  <th className="px-4 py-2">Ø 410, lg 3900</th>
                  <th className="px-4 py-2">Ø 420–800, lg 2000</th>
                </tr>
              </thead>
              <tbody>
                {SHAFT_ROWS.map((r) => (
                  <tr key={r.material} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {r.material}
                      {r.note && (
                        <Badge tone="blue" className="ml-2">
                          {r.note}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{r.diameter}</td>
                    <td className="px-4 py-2.5">{r.length}</td>
                    <td className="px-4 py-2.5">{r.asForged}</td>
                    <td className="px-4 py-2.5">{r.rate410}</td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-faint)]">{r.rate420_800}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Shell" description="All measurements in mm" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                  <th className="px-4 py-2">Sourcing</th>
                  <th className="px-4 py-2">Diameter Body</th>
                  <th className="px-4 py-2">Face Width Body</th>
                  <th className="px-4 py-2">Wall Thickness</th>
                  <th className="px-4 py-2">Welded-in Plate Thickness</th>
                  <th className="px-4 py-2">T-Bottom Thickness</th>
                  <th className="px-4 py-2">Rate/kg (End Plate)</th>
                  <th className="px-4 py-2">Rate/kg (Sheet)</th>
                  <th className="px-4 py-2">Plate (₹/kg)</th>
                  <th className="px-4 py-2">End Disc / Hub (₹/kg)</th>
                </tr>
              </thead>
              <tbody>
                {SHELL_ROWS.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <Badge tone={r.sourcing === 'In-house' ? 'teal' : 'purple'}>{r.sourcing}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{r.diameterBody}</td>
                    <td className="px-4 py-2.5">{r.faceWidth}</td>
                    <td className="px-4 py-2.5">{r.wallThickness}</td>
                    <td className="px-4 py-2.5">{r.weldedPlateThickness}</td>
                    <td className="px-4 py-2.5">{r.tBottomThickness}</td>
                    <td className="px-4 py-2.5">{r.rateEndPlate}</td>
                    <td className="px-4 py-2.5">{r.rateSheet}</td>
                    <td className="px-4 py-2.5">{r.plateRate}</td>
                    <td className="px-4 py-2.5">{r.hubRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
