import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useFormulaStore, type GlobalParameterDto, type MaterialRateDto, type LabourRateDto, type LogisticsRateDto } from '@/store/formulaStore'
import { useReferenceStore, type LaggingCatalogDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

// Lagging's key is its own separate namespace (unique only within Lagging, and
// editable) — a plain lowercase/underscore slug of the lagging type reads better
// there since the source data already writes it that way (e.g. "rubber_vulc_12mm").
// The other 4 tables' Key column below auto-fills the same way via ReferenceCrudTable's
// built-in `autoFillFrom`, which uses its own camelCase slugifier instead.
function slugifySnakeCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Key is required by the backend and unique across all 4 of these tables, but
// fixed after creation (PATCH with a different key is rejected) — so it's editable
// only in the Add form (via autoFillFrom), never in the table's existing rows.
const globalColumns: ReferenceColumn<GlobalParameterDto>[] = [
  { key: 'parameter', header: 'Parameter', type: 'text', required: true, editable: true },
  { key: 'key', header: 'Key', type: 'text', required: true, autoFillFrom: 'parameter' },
  { key: 'value', header: 'Value', type: 'number', required: true, editable: true },
  { key: 'unit', header: 'Unit', type: 'text', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const materialColumns: ReferenceColumn<MaterialRateDto>[] = [
  { key: 'material', header: 'Material', type: 'text', required: true, editable: true },
  { key: 'key', header: 'Key', type: 'text', required: true, autoFillFrom: 'material' },
  { key: 'inr_per_kg', header: 'INR/kg', type: 'number', required: true, editable: true },
  { key: 'eur_per_kg', header: 'EUR/kg', type: 'number', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const labourColumns: ReferenceColumn<LabourRateDto>[] = [
  { key: 'operation', header: 'Operation', type: 'text', required: true, editable: true },
  { key: 'key', header: 'Key', type: 'text', required: true, autoFillFrom: 'operation' },
  { key: 'inr_per_hour', header: 'INR/h', type: 'number', required: true, editable: true },
  { key: 'eur_per_hour', header: 'EUR/h', type: 'number', editable: true },
  { key: 'sourcing_default', header: 'Sourcing Default', type: 'text', editable: true },
]

const logisticsColumns: ReferenceColumn<LogisticsRateDto>[] = [
  { key: 'item', header: 'Item', type: 'text', required: true, editable: true },
  { key: 'key', header: 'Key', type: 'text', required: true, autoFillFrom: 'item' },
  { key: 'rate', header: 'Rate', type: 'number', required: true, editable: true },
  { key: 'unit', header: 'Unit', type: 'text', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const laggingColumns: ReferenceColumn<LaggingCatalogDto>[] = [
  { key: 'lagging_type', header: 'Lagging Type', type: 'text', required: true, editable: true },
  { key: 'thickness_mm', header: 'Thickness (mm)', type: 'number', required: true, editable: true },
  {
    key: 'price_inr_per_m2',
    header: 'INR/m²',
    type: 'number',
    required: true,
    editable: true,
    format: (r) => formatCurrency(r.price_inr_per_m2),
  },
  { key: 'delivery_days', header: 'Lead Time (days)', type: 'number', required: true, editable: true },
]

export function CostRateTablesPage() {
  const {
    loaded: formulasLoaded,
    loading: formulasLoading,
    globalParameters,
    materialRates,
    labourRates,
    logisticsRates,
    createGlobalParameter,
    updateGlobalParameter,
    deleteGlobalParameter,
    createMaterialRate,
    updateMaterialRate,
    deleteMaterialRate,
    createLabourRate,
    updateLabourRate,
    deleteLabourRate,
    createLogisticsRate,
    updateLogisticsRate,
    deleteLogisticsRate,
  } = useFormulaStore()
  const { loaded: refLoaded, loading: refLoading, lagging, createLagging, updateLagging, deleteLagging } = useReferenceStore()

  return (
    <div>
      <PageHeader title="Cost Rate Tables" description="The rate card behind the Pricing Tool — every calculation reads live from these values." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Add, edit, or delete a rate here and every Pricing Tool calculation picks it up immediately.</p>
      </div>

      <RequireLoaded loaded={formulasLoaded && refLoaded} loading={formulasLoading || refLoading}>
      <div className="space-y-5">
        <ReferenceCrudTable
          title="A. Global Parameters"
          rows={globalParameters}
          columns={globalColumns}
          addLabel="Add Rate"
          onCreate={(v) =>
            createGlobalParameter({
              key: String(v.key ?? '') || `global-${Date.now()}`,
              parameter: String(v.parameter ?? ''),
              value: Number(v.value ?? 0),
              unit: String(v.unit ?? ''),
              notes: String(v.notes ?? ''),
              order: globalParameters.length,
            })
          }
          onUpdate={(id, patch) => updateGlobalParameter(id, patch)}
          onDelete={deleteGlobalParameter}
        />

        <ReferenceCrudTable
          title="B. Material Rates"
          description="INR/kg — same figures as Raw Forging Prices, kept in sync"
          rows={materialRates}
          columns={materialColumns}
          addLabel="Add Rate"
          onCreate={(v) =>
            createMaterialRate({
              key: String(v.key ?? '') || `material-${Date.now()}`,
              material: String(v.material ?? ''),
              inr_per_kg: Number(v.inr_per_kg ?? 0),
              eur_per_kg: v.eur_per_kg !== undefined && v.eur_per_kg !== '' ? Number(v.eur_per_kg) : null,
              notes: String(v.notes ?? ''),
              order: materialRates.length,
            })
          }
          onUpdate={(id, patch) => updateMaterialRate(id, patch)}
          onDelete={deleteMaterialRate}
        />

        <ReferenceCrudTable
          title="C. Machining & Labour Rates"
          description="INR/hour unless noted"
          rows={labourRates}
          columns={labourColumns}
          addLabel="Add Rate"
          onCreate={(v) =>
            createLabourRate({
              key: String(v.key ?? '') || `labour-${Date.now()}`,
              operation: String(v.operation ?? ''),
              inr_per_hour: Number(v.inr_per_hour ?? 0),
              eur_per_hour: v.eur_per_hour !== undefined && v.eur_per_hour !== '' ? Number(v.eur_per_hour) : null,
              sourcing_default: String(v.sourcing_default ?? ''),
              order: labourRates.length,
            })
          }
          onUpdate={(id, patch) => updateLabourRate(id, patch)}
          onDelete={deleteLabourRate}
        />

        <ReferenceCrudTable
          title="E. Logistics & Packing Rates"
          rows={logisticsRates}
          columns={logisticsColumns}
          addLabel="Add Rate"
          onCreate={(v) =>
            createLogisticsRate({
              key: String(v.key ?? '') || `logistics-${Date.now()}`,
              item: String(v.item ?? ''),
              rate: Number(v.rate ?? 0),
              unit: String(v.unit ?? ''),
              notes: String(v.notes ?? ''),
              order: logisticsRates.length,
            })
          }
          onUpdate={(id, patch) => updateLogisticsRate(id, patch)}
          onDelete={deleteLogisticsRate}
        />

        <ReferenceCrudTable
          title="D. Lagging Rates"
          description="INR/m²"
          rows={lagging}
          columns={laggingColumns}
          addLabel="Add Lagging Rate"
          onCreate={(v) =>
            createLagging({
              key: slugifySnakeCase(String(v.lagging_type ?? '')) || `lagging-${Date.now()}`,
              lagging_type: String(v.lagging_type ?? ''),
              thickness_mm: Number(v.thickness_mm ?? 0),
              price_inr_per_m2: Number(v.price_inr_per_m2 ?? 0),
              delivery_days: Number(v.delivery_days ?? 0),
              description: '',
            })
          }
          onUpdate={(id, patch) => updateLagging(id, patch)}
          onDelete={deleteLagging}
        />
      </div>
      </RequireLoaded>
    </div>
  )
}
