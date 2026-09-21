import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useReferenceStore, type BearingCatalogDto, type HousingCatalogDto, type SleeveCatalogDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

const bearingColumns: ReferenceColumn<BearingCatalogDto>[] = [
  { key: 'designation', header: 'Designation', type: 'text', required: true },
  { key: 'bore_mm', header: 'Bore (mm)', type: 'number', required: true },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'price_eur', header: 'EUR/piece', type: 'number', required: true, format: (r) => `€${r.price_eur.toFixed(2)}` },
  { key: 'delivery_days', header: 'Delivery (days)', type: 'number', required: true },
]

const sleeveColumns: ReferenceColumn<SleeveCatalogDto>[] = [
  { key: 'sleeve_code', header: 'Sleeve Code', type: 'text', required: true },
  { key: 'for_bearing', header: 'For Bearing', type: 'text' },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'price_eur', header: 'EUR/piece', type: 'number', required: true, format: (r) => `€${r.price_eur.toFixed(2)}` },
]

const housingColumns: ReferenceColumn<HousingCatalogDto>[] = [
  { key: 'housing_designation', header: 'Housing Designation', type: 'text', required: true },
  { key: 'for_bearing', header: 'For Bearing', type: 'text' },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'delivery_days', header: 'Delivery (days)', type: 'number', required: true },
]

export function BearingSleeveDataPage() {
  const { loaded, loading, bearings, sleeves, housings, createBearing, deleteBearing, createSleeve, deleteSleeve, createHousing, deleteHousing } =
    useReferenceStore()

  return (
    <div>
      <PageHeader
        title="Bearing & Sleeve Data"
        description="Component catalogs behind the Technical Data Sheet's Bearing / Sleeve / Housing selectors — mirrors the client's Bearing & Sleeve Data, BRG_DATA, SL_DATA and HSG_DATA tabs."
      />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Add, or delete a row here and the Technical Data Sheet's matching designation dropdown updates immediately — if a table below is
          empty, that dropdown shows no options.
        </p>
      </div>

      <RequireLoaded loaded={loaded} loading={loading}>
      <div className="space-y-5">
        <ReferenceCrudTable
          title="A. Spherical Roller Bearings"
          description={`${bearings.length} designations`}
          rows={bearings}
          columns={bearingColumns}
          addLabel="Add Bearing"
          searchable
          onCreate={(v) =>
            createBearing({
              designation: String(v.designation ?? ''),
              bore_mm: Number(v.bore_mm ?? 0),
              price_inr: Number(v.price_inr ?? 0),
              price_eur: Number(v.price_eur ?? 0),
              delivery_days: Number(v.delivery_days ?? 0),
            })
          }
          onDelete={deleteBearing}
        />

        <ReferenceCrudTable
          title="B. Adapter Sleeves"
          description={`${sleeves.length} codes — matched by bearing designation`}
          rows={sleeves}
          columns={sleeveColumns}
          addLabel="Add Sleeve"
          searchable
          onCreate={(v) =>
            createSleeve({
              sleeve_code: String(v.sleeve_code ?? ''),
              for_bearing: String(v.for_bearing ?? ''),
              price_inr: Number(v.price_inr ?? 0),
              price_eur: Number(v.price_eur ?? 0),
            })
          }
          onDelete={deleteSleeve}
        />

        <ReferenceCrudTable
          title="C. Bearing Housings"
          description={`${housings.length} designations — matched by bearing designation`}
          rows={housings}
          columns={housingColumns}
          addLabel="Add Housing"
          searchable
          onCreate={(v) =>
            createHousing({
              housing_designation: String(v.housing_designation ?? ''),
              for_bearing: String(v.for_bearing ?? ''),
              price_inr: Number(v.price_inr ?? 0),
              delivery_days: Number(v.delivery_days ?? 0),
            })
          }
          onDelete={deleteHousing}
        />
      </div>
      </RequireLoaded>
    </div>
  )
}
