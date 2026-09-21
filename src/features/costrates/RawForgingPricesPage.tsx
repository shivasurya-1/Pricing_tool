import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useReferenceStore, type RawForgingRateDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

const columns: ReferenceColumn<RawForgingRateDto>[] = [
  { key: 'material', header: 'Material', type: 'text', required: true },
  { key: 'size_band_label', header: 'Size Band', type: 'text', required: true },
  { key: 'sourcing', header: 'Sourcing', type: 'select', options: ['Outsourced', 'Inhouse'] },
  {
    key: 'plate_rate_inr_per_kg',
    header: 'Plate / Shaft Rate (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.plate_rate_inr_per_kg != null ? formatCurrency(r.plate_rate_inr_per_kg) : '—'),
  },
  {
    key: 'end_disc_rate_inr_per_kg',
    header: 'End Disc / Hub Rate (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.end_disc_rate_inr_per_kg != null ? formatCurrency(r.end_disc_rate_inr_per_kg) : '—'),
  },
  { key: 'is_active_default', header: 'Active Default', type: 'text', format: (r) => (r.is_active_default ? 'Yes' : '') },
]

export function RawForgingPricesPage() {
  const { loaded, loading, rawForgingRates, createRawForgingRate, updateRawForgingRate, deleteRawForgingRate } = useReferenceStore()

  const shaftRows = useMemo(() => rawForgingRates.filter((r) => r.part === 'shaft'), [rawForgingRates])
  const shellRows = useMemo(() => rawForgingRates.filter((r) => r.part === 'shell'), [rawForgingRates])

  return (
    <div>
      <PageHeader title="Raw Forging Prices" description="Shaft and shell raw material rate bands by size — admin-editable, add or remove a band as needed." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>The row flagged as the active default is the one this app's Pricing Tool actually uses for its fallback rate.</p>
      </div>

      <RequireLoaded loaded={loaded} loading={loading}>
      <div className="space-y-5">
        <ReferenceCrudTable
          title="Shaft"
          rows={shaftRows}
          columns={columns}
          addLabel="Add Shaft Band"
          onCreate={(v) =>
            createRawForgingRate({
              part: 'shaft',
              material: String(v.material ?? ''),
              sourcing: String(v.sourcing ?? ''),
              size_band_label: String(v.size_band_label ?? ''),
              plate_rate_inr_per_kg: v.plate_rate_inr_per_kg ? Number(v.plate_rate_inr_per_kg) : null,
              end_disc_rate_inr_per_kg: v.end_disc_rate_inr_per_kg ? Number(v.end_disc_rate_inr_per_kg) : null,
              is_active_default: false,
              order: shaftRows.length,
            })
          }
          onUpdate={updateRawForgingRate}
          onDelete={deleteRawForgingRate}
        />

        <ReferenceCrudTable
          title="Shell"
          description="All measurements in mm"
          rows={shellRows}
          columns={columns}
          addLabel="Add Shell Band"
          onCreate={(v) =>
            createRawForgingRate({
              part: 'shell',
              material: String(v.material ?? ''),
              sourcing: String(v.sourcing ?? ''),
              size_band_label: String(v.size_band_label ?? ''),
              plate_rate_inr_per_kg: v.plate_rate_inr_per_kg ? Number(v.plate_rate_inr_per_kg) : null,
              end_disc_rate_inr_per_kg: v.end_disc_rate_inr_per_kg ? Number(v.end_disc_rate_inr_per_kg) : null,
              is_active_default: false,
              order: shellRows.length,
            })
          }
          onUpdate={updateRawForgingRate}
          onDelete={deleteRawForgingRate}
        />
      </div>
      </RequireLoaded>
    </div>
  )
}
