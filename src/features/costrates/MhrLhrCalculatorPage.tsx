import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useReferenceStore, type InHouseHourRateDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

const columns: ReferenceColumn<InHouseHourRateDto>[] = [
  { key: 'cost_head', header: 'Cost Head', type: 'text', required: true },
  { key: 'operation', header: 'Operation', type: 'text', required: true },
  { key: 'cost_centre', header: 'Cost Centre', type: 'text' },
  { key: 'activity_description', header: 'Activity Description', type: 'text', required: true },
  { key: 'mhr_rate', header: 'MHR Rate', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.mhr_rate) },
]

export function MhrLhrCalculatorPage() {
  const { loaded, loading, inHouseHourRates, createInHouseHourRate, updateInHouseHourRate, deleteInHouseHourRate } = useReferenceStore()

  return (
    <div>
      <PageHeader title="In-House Hours" description="Cost head rate legend — informational reference for the In-House Processing Hours section of the Technical Data Sheet." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Add, edit, or delete a row here to keep this legend current. The actual per-operation labour rates used in Pricing Tool
          calculations live on Cost Rate Tables → Machining &amp; Labour Rates.
        </p>
      </div>

      <RequireLoaded loaded={loaded} loading={loading}>
      <ReferenceCrudTable
        title="In-House Hours"
        rows={inHouseHourRates}
        columns={columns}
        addLabel="Add Row"
        onCreate={(v) =>
          createInHouseHourRate({
            cost_head: String(v.cost_head ?? ''),
            operation: String(v.operation ?? ''),
            cost_centre: String(v.cost_centre ?? ''),
            activity_description: String(v.activity_description ?? ''),
            mhr_rate: Number(v.mhr_rate ?? 0),
            order: inHouseHourRates.length,
          })
        }
        onUpdate={updateInHouseHourRate}
        onDelete={deleteInHouseHourRate}
      />
      </RequireLoaded>
    </div>
  )
}
