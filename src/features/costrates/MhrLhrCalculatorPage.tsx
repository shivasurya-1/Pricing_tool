import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { RequireLoaded } from '@/components/reference/RequireLoaded'
import { useReferenceStore, type InHouseHourRateDto } from '@/store/referenceStore'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/lib/format'
import { InHouseHoursGrid } from './InHouseHoursGrid'

/** c1 … the highest code in use (at least c7), plus the next new one. */
function sectionCLineOptions(rows: InHouseHourRateDto[]): string[] {
  const highest = Math.max(7, ...rows.map((r) => (r.operation_code ? Number(r.operation_code.slice(1)) : 0)))
  return Array.from({ length: highest + 1 }, (_, i) => `c${i + 1}`)
}

const rateColumns = (lineOptions: string[]): ReferenceColumn<InHouseHourRateDto>[] => [
  { key: 'cost_head', header: 'Cost Head', type: 'text', required: true },
  { key: 'operation', header: 'Operation', type: 'text', required: true },
  { key: 'cost_centre', header: 'Cost Centre', type: 'text' },
  { key: 'activity_description', header: 'Activity Description', type: 'text', required: true },
  {
    key: 'operation_code',
    header: 'Section C Line',
    type: 'select',
    options: lineOptions,
    editable: true,
    format: (r) => (r.operation_code ? r.operation_code.toUpperCase() : '—'),
  },
  { key: 'mhr_rate', header: 'MHR Rate (INR/h)', type: 'number', required: true, editable: true, format: (r) => formatCurrency(r.mhr_rate) },
  { key: 'default_run_min', header: 'Default Run (min)', type: 'number', editable: true },
  { key: 'default_setup_min', header: 'Default Setup (min)', type: 'number', editable: true },
]

/**
 * The workbook's In-House Hours sheet: pick an RFQ to enter each of its pulleys' ("models'")
 * run/setup minutes against the MHR rates, which feed Section C of the Pricing Tool. The
 * rates themselves are master data shared by every RFQ, edited in the table below.
 */
export function MhrLhrCalculatorPage() {
  const { loaded, loading, inHouseHourRates, createInHouseHourRate, updateInHouseHourRate, deleteInHouseHourRate } = useReferenceStore()
  const rfqs = useDataStore((s) => s.rfqs)
  const role = useAuthStore((s) => s.role)
  // Same rule as the backend's CanEditReferenceData.
  const canEditRates = role === 'Controlling' || role === 'Admin'
  const [rfqId, setRfqId] = useState('')
  const rfq = rfqs.find((r) => r.id === rfqId)
  const columns = useMemo(() => rateColumns(sectionCLineOptions(inHouseHourRates)), [inHouseHourRates])

  return (
    <div>
      <PageHeader title="In-House Hours" description="Run and setup minutes per model, costed at the MHR rates — feeds Section C (In-House Processing) of the Pricing Tool." />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label htmlFor="ihh-rfq" className="text-xs font-medium text-[var(--color-ink-soft)]">
            RFQ
          </label>
          <select
            id="ihh-rfq"
            value={rfqId}
            onChange={(e) => setRfqId(e.target.value)}
            className="min-w-[260px] rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">Select an RFQ to enter its hours...</option>
            {rfqs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfqNumber} — {r.endCustomer} ({r.items.length} {r.items.length === 1 ? 'model' : 'models'})
              </option>
            ))}
          </select>
        </div>
      </Card>

      <RequireLoaded loaded={loaded} loading={loading}>
        {rfq ? (
          <Card className="mb-5 p-4">
            <InHouseHoursGrid rfq={rfq} />
          </Card>
        ) : (
          <p className="mb-5 text-sm text-[var(--color-ink-soft)]">Pick an RFQ above to see its models side by side, as in the In-House Hours sheet.</p>
        )}

        {canEditRates && (
          <>
            <div className="mb-3 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
              <Info size={16} className="mt-0.5 shrink-0" />
              <p>
                MHR rates and default minutes, shared by every RFQ. Each row is a Section C line of the Pricing Tool — a new row gets
                the next free line (C7, C8, …) automatically. A model uses the default minutes until its own are entered above. Saved
                changes apply to every RFQ's pricing.
              </p>
            </div>
            <ReferenceCrudTable
              title="MHR Rates"
              rows={inHouseHourRates}
              columns={columns}
              addLabel="Add Row"
              onCreate={(v) =>
                createInHouseHourRate({
                  cost_head: String(v.cost_head ?? ''),
                  operation: String(v.operation ?? ''),
                  cost_centre: String(v.cost_centre ?? ''),
                  activity_description: String(v.activity_description ?? ''),
                  operation_code: v.operation_code ? String(v.operation_code) : null,
                  mhr_rate: Number(v.mhr_rate ?? 0),
                  default_run_min: Number(v.default_run_min ?? 0),
                  default_setup_min: Number(v.default_setup_min ?? 0),
                  order: inHouseHourRates.length,
                })
              }
              onUpdate={(id, patch) => updateInHouseHourRate(id, { ...patch, operation_code: patch.operation_code ? String(patch.operation_code) : null })}
              onDelete={deleteInHouseHourRate}
            />
          </>
        )}
      </RequireLoaded>
    </div>
  )
}
