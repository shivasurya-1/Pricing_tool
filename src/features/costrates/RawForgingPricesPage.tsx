import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useReferenceStore, type ShaftBandDto, type ShellBandDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

const shaftColumns: ReferenceColumn<ShaftBandDto>[] = [
  { key: 'material', header: 'Material', type: 'text', required: true, editable: true },
  { key: 'diameter', header: 'Diameter', type: 'text', required: true, editable: true },
  { key: 'length', header: 'Length', type: 'text', required: true, editable: true },
  {
    key: 'as_forge_rate_inr_per_kg',
    header: 'As-forge Rate (₹/kg)',
    // Free text, not a number — given as a range (e.g. "175 - 225"), not a single rate.
    type: 'text',
    editable: true,
    format: (r) => (r.as_forge_rate_inr_per_kg != null && r.as_forge_rate_inr_per_kg !== '' ? r.as_forge_rate_inr_per_kg : '—'),
  },
  // The client sheet's own "Shaft with Full Machined Scope" table has a second,
  // special-case rate block keyed by one exact diameter+length combo each — not a
  // general size band like the columns above, so it's two extra optional rate
  // columns rather than folding into Diameter/Length. Leave blank for "?"/"Need Basis".
  {
    key: 'rate_dia_410_lg_3900_inr_per_kg',
    header: 'Ø 410, lg 3900 (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.rate_dia_410_lg_3900_inr_per_kg != null ? formatCurrency(r.rate_dia_410_lg_3900_inr_per_kg) : '—'),
  },
  {
    key: 'rate_dia_420_800_lg_2000_inr_per_kg',
    header: 'Ø 420-800, lg 2000 (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.rate_dia_420_800_lg_2000_inr_per_kg != null ? formatCurrency(r.rate_dia_420_800_lg_2000_inr_per_kg) : '—'),
  },
]

const shellColumns: ReferenceColumn<ShellBandDto>[] = [
  { key: 'sourcing', header: 'Sourcing', type: 'select', options: ['Outsourced', 'Inhouse'], editable: true },
  { key: 'diameter_body', header: 'Diameter Body', type: 'text', required: true, editable: true },
  { key: 'face_width_body', header: 'Face Width Body', type: 'text', required: true, editable: true },
  { key: 'wall_thickness', header: 'Wall Thickness', type: 'text', editable: true },
  { key: 'welded_in_plate_thickness', header: 'Welded-in Plate Thickness', type: 'text', editable: true },
  { key: 't_bottom_thickness', header: 'T-bottom Thickness', type: 'text', editable: true },
  {
    key: 'plate_rate_inr_per_kg',
    header: 'Plate Rate (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.plate_rate_inr_per_kg != null ? formatCurrency(r.plate_rate_inr_per_kg) : '—'),
  },
  {
    key: 'end_disc_hub_rate_inr_per_kg',
    header: 'End Disc / Hub Rate (₹/kg)',
    type: 'number',
    editable: true,
    format: (r) => (r.end_disc_hub_rate_inr_per_kg != null ? formatCurrency(r.end_disc_hub_rate_inr_per_kg) : '—'),
  },
]

export function RawForgingPricesPage() {
  const {
    loaded,
    loading,
    shaftBands,
    shellBands,
    createShaftBand,
    updateShaftBand,
    deleteShaftBand,
    createShellBand,
    updateShellBand,
    deleteShellBand,
  } = useReferenceStore()

  return (
    <div>
      <PageHeader title="Raw Forging Prices" description="Shaft and shell raw material rate bands by size — admin-editable, add or remove a band as needed." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Add, edit, or delete a band here to keep this reference table current.</p>
      </div>

      <RequireLoaded loaded={loaded} loading={loading}>
      <div className="space-y-5">
        <ReferenceCrudTable
          title="Shaft"
          rows={shaftBands}
          columns={shaftColumns}
          addLabel="Add Shaft Band"
          onCreate={(v) =>
            createShaftBand({
              material: String(v.material ?? ''),
              diameter: String(v.diameter ?? ''),
              length: String(v.length ?? ''),
              as_forge_rate_inr_per_kg:
                v.as_forge_rate_inr_per_kg !== undefined && v.as_forge_rate_inr_per_kg !== '' ? String(v.as_forge_rate_inr_per_kg) : null,
              rate_dia_410_lg_3900_inr_per_kg:
                v.rate_dia_410_lg_3900_inr_per_kg !== undefined && v.rate_dia_410_lg_3900_inr_per_kg !== ''
                  ? Number(v.rate_dia_410_lg_3900_inr_per_kg)
                  : null,
              rate_dia_420_800_lg_2000_inr_per_kg:
                v.rate_dia_420_800_lg_2000_inr_per_kg !== undefined && v.rate_dia_420_800_lg_2000_inr_per_kg !== ''
                  ? Number(v.rate_dia_420_800_lg_2000_inr_per_kg)
                  : null,
              order: shaftBands.length,
            })
          }
          onUpdate={(id, patch) => updateShaftBand(id, patch)}
          onDelete={deleteShaftBand}
        />

        <ReferenceCrudTable
          title="Shell"
          description="All measurements in mm"
          rows={shellBands}
          columns={shellColumns}
          addLabel="Add Shell Band"
          onCreate={(v) =>
            createShellBand({
              sourcing: String(v.sourcing ?? ''),
              diameter_body: String(v.diameter_body ?? ''),
              face_width_body: String(v.face_width_body ?? ''),
              wall_thickness: String(v.wall_thickness ?? ''),
              welded_in_plate_thickness: String(v.welded_in_plate_thickness ?? ''),
              t_bottom_thickness: String(v.t_bottom_thickness ?? ''),
              plate_rate_inr_per_kg: v.plate_rate_inr_per_kg !== undefined && v.plate_rate_inr_per_kg !== '' ? Number(v.plate_rate_inr_per_kg) : null,
              end_disc_hub_rate_inr_per_kg:
                v.end_disc_hub_rate_inr_per_kg !== undefined && v.end_disc_hub_rate_inr_per_kg !== '' ? Number(v.end_disc_hub_rate_inr_per_kg) : null,
              order: shellBands.length,
            })
          }
          onUpdate={(id, patch) => updateShellBand(id, patch)}
          onDelete={deleteShellBand}
        />
      </div>
      </RequireLoaded>
    </div>
  )
}
