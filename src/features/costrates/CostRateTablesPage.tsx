import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import {
  useFormulaStore,
  type CostRateRows,
  type CostRateTableId,
  type GlobalParameterDto,
  type LogisticsPackingRateDto,
  type MachiningLabourRateDto,
  type MaterialRateDto,
} from '@/store/formulaStore'
import { useReferenceStore, type LaggingCatalogDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

// `key` is the variable name formulas read a rate under, so it's set once on create
// and never inline-editable (the backend rejects a change too).
const keyColumn = { key: 'key', header: 'Key', type: 'text', required: true } as const

const globalColumns: ReferenceColumn<GlobalParameterDto>[] = [
  { key: 'parameter', header: 'Parameter', type: 'text', required: true, editable: true },
  keyColumn,
  { key: 'value', header: 'Value', type: 'number', required: true, editable: true },
  { key: 'unit', header: 'Unit', type: 'text', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const materialColumns: ReferenceColumn<MaterialRateDto>[] = [
  { key: 'material', header: 'Material', type: 'text', required: true, editable: true },
  keyColumn,
  { key: 'inr_per_kg', header: 'INR/kg', type: 'number', required: true, editable: true },
  { key: 'eur_per_kg', header: 'EUR/kg', type: 'number', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const labourColumns: ReferenceColumn<MachiningLabourRateDto>[] = [
  { key: 'operation', header: 'Operation', type: 'text', required: true, editable: true },
  keyColumn,
  { key: 'inr_per_hour', header: 'INR/h', type: 'number', required: true, editable: true },
  { key: 'eur_per_hour', header: 'EUR/h', type: 'number', editable: true },
  { key: 'sourcing_default', header: 'Sourcing Default', type: 'text', editable: true },
]

const logisticsColumns: ReferenceColumn<LogisticsPackingRateDto>[] = [
  { key: 'item', header: 'Item', type: 'text', required: true, editable: true },
  keyColumn,
  { key: 'rate', header: 'Rate', type: 'number', required: true, editable: true },
  { key: 'unit', header: 'Unit', type: 'text', editable: true },
  { key: 'notes', header: 'Notes', type: 'text', editable: true },
]

const laggingColumns: ReferenceColumn<LaggingCatalogDto>[] = [
  { key: 'lagging_type', header: 'Lagging Type', type: 'text', required: true, editable: true },
  { key: 'key', header: 'Key', type: 'text', required: true, editable: true },
  { key: 'thickness_mm', header: 'Thickness (mm)', type: 'number', required: true, editable: true },
  { key: 'price_inr_per_m2', header: 'INR/m²', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.price_inr_per_m2) },
  { key: 'delivery_days', header: 'Lead Time (days)', type: 'number', required: true, editable: true },
]

/** Add-row modal values -> API payload: blank optional numbers become null, blank text ''. */
function toPayload<T>(columns: ReferenceColumn<T>[], values: Record<string, string | number>) {
  return Object.fromEntries(
    columns.map((c) => {
      const v = values[c.key]
      if (v === undefined || v === '') return [c.key, c.type === 'number' ? null : '']
      return [c.key, c.type === 'number' ? Number(v) : String(v)]
    }),
  )
}

export function CostRateTablesPage() {
  const { loaded: formulasLoaded, loading: formulasLoading, costRateRows, createCostRate, updateCostRate, deleteCostRate } = useFormulaStore()
  const { loaded: refLoaded, loading: refLoading, lagging, createLagging, updateLagging, deleteLagging } = useReferenceStore()

  function section<K extends CostRateTableId>(table: K, title: string, columns: ReferenceColumn<CostRateRows[K][number]>[], description?: string) {
    const rows = [...costRateRows[table]].sort((a, b) => a.order - b.order) as CostRateRows[K][number][]
    return (
      <ReferenceCrudTable
        title={title}
        description={description}
        rows={rows}
        columns={columns}
        addLabel="Add Rate"
        onCreate={(v) =>
          createCostRate(table, { ...toPayload(columns, v), order: costRateRows[table].length } as Omit<CostRateRows[K][number], 'id'>)
        }
        onUpdate={(id, patch) => updateCostRate(table, id, patch)}
        onDelete={(id) => deleteCostRate(table, id)}
      />
    )
  }

  return (
    <div>
      <PageHeader title="Cost Rate Tables" description="The rate card behind the Pricing Tool — every calculation reads live from these values." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Add, edit, or delete a rate here and every Pricing Tool calculation picks it up immediately. A rate's Key is what formulas reference, so it can't be changed once created.</p>
      </div>

      <RequireLoaded loaded={formulasLoaded && refLoaded} loading={formulasLoading || refLoading}>
        <div className="space-y-5">
          {section('global', '1. Global Parameters', globalColumns)}
          {section('material', '2. Material Rates', materialColumns, 'INR/kg — EUR/kg is optional and informational')}
          {section('labour', '3. Machining & Labour Rates', labourColumns, 'INR/hour — EUR/hour is optional and informational')}
          {section('logistics', '4. Logistics & Packing Rates', logisticsColumns)}

          <ReferenceCrudTable
            title="5. Lagging Rates"
            description="INR/m²"
            rows={lagging}
            columns={laggingColumns}
            addLabel="Add Lagging Rate"
            onCreate={(v) => createLagging({ ...toPayload(laggingColumns, v), description: '' } as Omit<LaggingCatalogDto, 'id'>)}
            onUpdate={updateLagging}
            onDelete={deleteLagging}
          />
        </div>
      </RequireLoaded>
    </div>
  )
}
