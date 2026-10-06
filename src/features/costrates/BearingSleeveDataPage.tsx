import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import {
  useReferenceStore,
  type BearingCatalogDto,
  type HousingCatalogDto,
  type SleeveCatalogDto,
  type LaggingCatalogDto,
  type LockingDeviceCatalogDto,
} from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

// Matches Cost Rate Tables' own Lagging key convention (Lagging's key is its own
// namespace, unique only within Lagging, editable) — a plain lowercase/underscore
// slug of the lagging type, e.g. "Rubber vulc. 12mm" → "rubber_vulc_12mm". Not shown
// as a visible field here since Lagging Type already doubles as the human-readable key.
function slugifySnakeCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const bearingColumns: ReferenceColumn<BearingCatalogDto>[] = [
  { key: 'designation', header: 'Designation', type: 'text', required: true, editable: true },
  { key: 'bore_mm', header: 'Bore (mm)', type: 'number', required: true, editable: true },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'price_eur', header: 'EUR/piece', type: 'number', required: true, editable: true, format: (r) => `€${r.price_eur.toFixed(2)}` },
  { key: 'delivery_days', header: 'Delivery (days)', type: 'number', required: true, editable: true },
]

const sleeveColumns: ReferenceColumn<SleeveCatalogDto>[] = [
  { key: 'sleeve_code', header: 'Sleeve Code', type: 'text', required: true, editable: true },
  { key: 'for_bearing', header: 'For Bearing', type: 'text', editable: true },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'price_eur', header: 'EUR/piece', type: 'number', required: true, editable: true, format: (r) => `€${r.price_eur.toFixed(2)}` },
]

const housingColumns: ReferenceColumn<HousingCatalogDto>[] = [
  { key: 'housing_designation', header: 'Housing Designation', type: 'text', required: true, editable: true },
  { key: 'for_bearing', header: 'For Bearing', type: 'text', editable: true },
  { key: 'price_inr', header: 'INR/piece', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.price_inr) },
  { key: 'delivery_days', header: 'Delivery (days)', type: 'number', required: true, editable: true },
]

const laggingColumns: ReferenceColumn<LaggingCatalogDto>[] = [
  { key: 'lagging_type', header: 'Lagging Type (key)', type: 'text', required: true, editable: true },
  { key: 'thickness_mm', header: 'Thickness (mm)', type: 'number', required: true, editable: true },
  { key: 'price_inr_per_m2', header: 'INR/m²', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.price_inr_per_m2) },
  { key: 'delivery_days', header: 'Delivery (days)', type: 'number', required: true, editable: true },
  { key: 'description', header: 'Description', type: 'text', editable: true },
]

const lockingDeviceColumns: ReferenceColumn<LockingDeviceCatalogDto>[] = [
  { key: 'model_size', header: 'Model / Size', type: 'text', required: true, editable: true },
  { key: 'indicative_price', header: 'Indicative price per No. (₹)', type: 'text', editable: true },
  { key: 'negotiated_rate_inr', header: 'Negotiated Rate', type: 'number', required: true, editable: true },
  { key: 'remarks', header: 'Remarks', type: 'text', editable: true },
]

export function BearingSleeveDataPage() {
  const {
    loaded,
    loading,
    bearings,
    sleeves,
    housings,
    lagging,
    lockingDevices,
    createBearing,
    updateBearing,
    deleteBearing,
    createSleeve,
    updateSleeve,
    deleteSleeve,
    createHousing,
    updateHousing,
    deleteHousing,
    createLagging,
    updateLagging,
    deleteLagging,
    createLockingDevice,
    updateLockingDevice,
    deleteLockingDevice,
  } = useReferenceStore()

  return (
    <div>
      <PageHeader
        title="Bearing & Sleeve Data"
        description="Component catalogs behind the Technical Data Sheet's Bearing / Sleeve / Housing / Lagging / Locking Device selectors — mirrors the client's BRG_DATA, SL_DATA, HSG_DATA, LAG_DATA and LCD_DATA tabs."
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
          onUpdate={(id, patch) => updateBearing(id, patch)}
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
          onUpdate={(id, patch) => updateSleeve(id, patch)}
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
          onUpdate={(id, patch) => updateHousing(id, patch)}
          onDelete={deleteHousing}
        />

        <ReferenceCrudTable
          title="D. Lagging"
          description={`${lagging.length} types — also editable on Cost Rate Tables → D. Lagging Rates`}
          rows={lagging}
          columns={laggingColumns}
          addLabel="Add Lagging"
          searchable
          onCreate={(v) =>
            createLagging({
              key: slugifySnakeCase(String(v.lagging_type ?? '')) || `lagging-${Date.now()}`,
              lagging_type: String(v.lagging_type ?? ''),
              thickness_mm: Number(v.thickness_mm ?? 0),
              price_inr_per_m2: Number(v.price_inr_per_m2 ?? 0),
              delivery_days: Number(v.delivery_days ?? 0),
              description: String(v.description ?? ''),
            })
          }
          onUpdate={(id, patch) => updateLagging(id, patch)}
          onDelete={deleteLagging}
        />

        <ReferenceCrudTable
          title="E. Locking Devices"
          description={`${lockingDevices.length} models`}
          rows={lockingDevices}
          columns={lockingDeviceColumns}
          addLabel="Add Locking Device"
          searchable
          onCreate={(v) =>
            createLockingDevice({
              model_size: String(v.model_size ?? ''),
              indicative_price: String(v.indicative_price ?? ''),
              negotiated_rate_inr: Number(v.negotiated_rate_inr ?? 0),
              remarks: String(v.remarks ?? ''),
            })
          }
          onUpdate={(id, patch) => updateLockingDevice(id, patch)}
          onDelete={deleteLockingDevice}
        />
      </div>
      </RequireLoaded>
    </div>
  )
}
