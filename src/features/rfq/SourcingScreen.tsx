import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSpreadsheet, Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Drawer'
import { EmptyState } from '@/components/EmptyState'
import { SendBackModal } from '@/components/workflow/SendBackModal'
import { RejectModal } from '@/components/workflow/RejectModal'
import { PulleyTechDataView } from '@/components/pulley/PulleyTechDataView'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { BOUGHT_OUT_COMPONENTS, SOURCING_OPTIONS } from '@/data/pulleyTechDataSchema'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { computeWithSourcing, fieldLabelFor, formulaCostSummary, HOME_MODE, isFieldHidden, sourcingFields } from '@/lib/outsourcedCosts'
import { useFormulaStore, type TechDataFieldDto } from '@/store/formulaStore'
import { formatCurrency } from '@/lib/format'
import { SEND_BACK_TARGETS } from '@/lib/workflow'
import type { CustomProcess, RFQItem, SourcingMode, Vendor } from '@/types'

export function SourcingScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const vendors = useDataStore((s) => s.vendors)
  // Subscribed (not just read) so a formula saved on the Formulas page re-renders this
  // screen's live per-item cost immediately.
  useFormulaStore((s) => s.formulas)
  useFormulaStore((s) => s.costRates)
  const confirmItemSourcing = useDataStore((s) => s.confirmItemSourcing)
  const assignProcessVendor = useDataStore((s) => s.assignProcessVendor)
  const setOutsourcedFieldCost = useDataStore((s) => s.setOutsourcedFieldCost)
  const setOutsourcedFieldMode = useDataStore((s) => s.setOutsourcedFieldMode)
  const setOutsourcedFieldMeta = useDataStore((s) => s.setOutsourcedFieldMeta)
  const addCustomProcess = useDataStore((s) => s.addCustomProcess)
  const updateCustomProcess = useDataStore((s) => s.updateCustomProcess)
  const deleteCustomProcess = useDataStore((s) => s.deleteCustomProcess)
  // Re-render when Pricing Section D fields are added/changed on the Formulas page.
  const techDataFields = useFormulaStore((s) => s.techDataFields)
  const saveSourcingComment = useDataStore((s) => s.saveSourcingComment)
  const submitSourcing = useDataStore((s) => s.submitSourcing)
  const sendBack = useDataStore((s) => s.sendBack)
  const rejectRFQ = useDataStore((s) => s.rejectRFQ)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)
  const [techDataItem, setTechDataItem] = useState<RFQItem | null>(null)

  const rfq = rfqs.find((r) => r.id === id)
  const [comment, setComment] = useState(rfq?.sourcingComments ?? '')
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  if (!rfq) return <EmptyState title="RFQ not found" />
  if (rfq.stage !== 'Sourcing') {
    return (
      <EmptyState title="This RFQ is not awaiting Sourcing" description={`Current stage: ${rfq.stage}`} action={<Button onClick={() => navigate(`/rfqs/${rfq.id}`)}>View RFQ</Button>} />
    )
  }

  const allConfirmed = rfq.items.every((item) => item.sourcingConfirmed)

  // Same figures as the Pricing Tool page (Formulas-page totals, Sourcing rows/modes/costs
  // applied); the built-in calculation only if those Formulas fields aren't loaded.
  const pricingByItem = new Map(
    rfq.items.map((item) => {
      const fromFormulas = formulaCostSummary(item)
      if (fromFormulas) return [item.id, fromFormulas]
      const p = computePulleyPricing(item.technicalData ?? {})
      return [item.id, { inHouse: p.totalC * (p.qty || 1), outsourced: p.totalD * (p.qty || 1), totalDirectCost: p.totalDirectCost, perUnit: p.totalDirectCostPerUnit, qty: p.qty }]
    }),
  )
  const totalDirectCost = [...pricingByItem.values()].reduce((sum, p) => sum + p.totalDirectCost, 0)
  const totalInHouse = [...pricingByItem.values()].reduce((sum, p) => sum + p.inHouse, 0)
  const totalOutsourced = [...pricingByItem.values()].reduce((sum, p) => sum + p.outsourced, 0)
  // Rows of the processes table (Formulas-page Section C/D fields + added rows) set to Outsource.
  const outsourcedCount = rfq.items.reduce(
    (sum, item) =>
      sum +
      sourcingFields(techDataFields).filter(
        ({ field, home }) => !isFieldHidden(item, field.key) && (item.outsourcedFieldModes?.[field.key] ?? HOME_MODE[home]) === 'Outsource',
      ).length +
      (item.customProcesses ?? []).filter((c) => (c.mode ?? 'Outsource') === 'Outsource').length,
    0,
  )

  const handleSubmit = () => {
    if (!allConfirmed) {
      pushToast('Confirm sourcing for every item before submitting.', 'error')
      return
    }
    saveSourcingComment(rfq.id, comment)
    submitSourcing(rfq.id, name)
    pushToast('Sourcing confirmed. Submitted to Controlling.', 'success')
    navigate('/rfqs')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: rfq.rfqNumber, to: `/rfqs/${rfq.id}` }, { label: 'Sourcing' }]}
        title={`Sourcing — ${rfq.rfqNumber}`}
        description={`${rfq.endCustomer} · ${rfq.projectName}`}
      />

      <div className="space-y-5">
        {rfq.items.map((item) => {
          const pricing = pricingByItem.get(item.id)!
          const values = item.technicalData ?? {}

          return (
            <Card key={item.id}>
              <CardHeader
                title={item.productName}
                description={`Qty: ${item.quantity} ${item.unit} · Required: ${new Date(item.requiredDelivery).toLocaleDateString('en-GB')}`}
                action={
                  <div className="flex items-center gap-2">
                    {item.sourcingConfirmed ? <Badge tone="green">Confirmed</Badge> : <Badge tone="amber">Pending Review</Badge>}
                    <Button size="sm" variant="secondary" icon={<FileSpreadsheet size={13} />} onClick={() => setTechDataItem(item)} disabled={!isTechDataFilled(item.technicalData)}>
                      View Spec
                    </Button>
                  </div>
                }
              />

              <div className="space-y-4 p-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Bought-Out Components</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
                          <th className="px-3 py-2">Component</th>
                          <th className="px-3 py-2">Designation</th>
                          <th className="px-3 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {BOUGHT_OUT_COMPONENTS.map((c) => (
                          <tr key={c.key} className="border-b border-[var(--color-border)]">
                            <td className="px-3 py-2 font-medium">{c.label}</td>
                            <td className="px-3 py-2">{String(values[c.designationKey] ?? '—')}</td>
                            <td className="px-3 py-2 text-right">
                              {formatCurrency(Number(values[c.priceKey]) || 0)}
                              {c.priceUnit && <span className="text-[var(--color-ink-faint)]">{c.priceUnit}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">In-House / Outsource Processes</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
                          <th className="px-3 py-2">Process</th>
                          <th className="px-3 py-2">Mode</th>
                          <th className="px-3 py-2 text-right">Cost</th>
                          <th className="px-3 py-2">Vendor (if outsourced)</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <OutsourcedRows
                          item={item}
                          techDataFields={techDataFields}
                          vendors={vendors}
                          onFieldCost={(fieldKey, cost) => setOutsourcedFieldCost(rfq.id, item.id, fieldKey, cost)}
                          onFieldVendor={(fieldKey, v) => assignProcessVendor(rfq.id, item.id, fieldKey, v?.id ?? '', v?.name ?? '')}
                          onFieldMode={(fieldKey, mode) => setOutsourcedFieldMode(rfq.id, item.id, fieldKey, mode)}
                          onFieldMeta={(fieldKey, meta) => setOutsourcedFieldMeta(rfq.id, item.id, fieldKey, meta)}
                          onAdd={(input) => addCustomProcess(rfq.id, item.id, input)}
                          onUpdate={(customId, patch) => updateCustomProcess(rfq.id, item.id, customId, patch)}
                          onDelete={(customId) => deleteCustomProcess(rfq.id, item.id, customId)}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                  <div className="text-xs text-[var(--color-ink-faint)]">
                    Total Direct Cost:{' '}
                    <span className="font-semibold text-[var(--color-ink)]">{formatCurrency(pricing.totalDirectCost)}</span> ({formatCurrency(pricing.perUnit)} / unit
                    &times; {pricing.qty})
                  </div>
                  <Button
                    size="sm"
                    variant={item.sourcingConfirmed ? 'secondary' : 'primary'}
                    icon={item.sourcingConfirmed ? <Check size={13} /> : undefined}
                    onClick={() => confirmItemSourcing(rfq.id, item.id, !item.sourcingConfirmed)}
                  >
                    {item.sourcingConfirmed ? 'Confirmed — Undo' : 'Confirm Sourcing for this Item'}
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}

        <Card>
          <CardHeader title="Sourcing Summary" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Stat label="Total Direct Cost" value={formatCurrency(totalDirectCost)} />
            <Stat label="In-House Cost" value={formatCurrency(totalInHouse)} />
            <Stat label="Outsourced Cost" value={formatCurrency(totalOutsourced)} />
            <Stat label="Processes Outsourced" value={String(outsourcedCount)} />
          </div>
          <div className="border-t border-[var(--color-border)] p-4">
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">Sourcing Comments</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] p-4">
            <Button variant="danger" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
            <Button variant="secondary" onClick={() => setSendBackOpen(true)}>
              Send Back
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Submit to Controlling
            </Button>
          </div>
        </Card>
      </div>

      <SendBackModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        targets={SEND_BACK_TARGETS['Sourcing'] ?? []}
        onConfirm={(target, c) => {
          sendBack(rfq.id, target, 'Sourcing', name, c)
          pushToast(`${rfq.rfqNumber} sent back with comments.`, 'warning')
          navigate('/rfqs')
        }}
      />
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        rfq={rfq}
        onConfirm={(reason, c) => {
          rejectRFQ(rfq.id, 'Sourcing', name, reason, c)
          pushToast(`${rfq.rfqNumber} rejected.`, 'error')
          navigate('/rfqs')
        }}
      />

      <Drawer open={!!techDataItem} onClose={() => setTechDataItem(null)} title={`Technical Data — ${techDataItem?.productName ?? ''}`} width="max-w-2xl">
        <PulleyTechDataView values={techDataItem?.technicalData} />
      </Drawer>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  )
}

const INPUT_CLASS =
  'rounded border border-[var(--color-border)] px-2 py-1 text-[11px] outline-none focus:border-[var(--color-blue)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-faint)]'

const parseCost = (raw: string): number | null => {
  const n = Number(raw.replace(/,/g, '').trim())
  return raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** An added row whose cost comes from its In-House Hours minutes. */
const hasHours = (c: CustomProcess) => c.mhrRate != null || c.runMin != null || c.setupMin != null

type VendorRef = { id: string; name: string } | null
type CustomProcessInput = { label: string; cost: number; mode?: SourcingMode; vendorId?: string; vendorName?: string }

/**
 * Extra rows of the In-House / Outsource Processes table, after the standard processes:
 *  - every field the Formulas page has under "Pricing Section D — Outsourced Processing"
 *    (total rows excluded) — a cost saved here replaces that field's formula for this pulley
 *    (↺ goes back to the formula);
 *  - rows added here for this pulley only.
 * Each row's mode decides where its cost goes on the Pricing Tool page: Outsource -> D,
 * In-house -> C, Logistics -> E (see lib/outsourcedCosts.ts).
 */
function OutsourcedRows({
  item,
  techDataFields,
  vendors,
  onFieldCost,
  onFieldVendor,
  onFieldMode,
  onFieldMeta,
  onAdd,
  onUpdate,
  onDelete,
}: {
  item: RFQItem
  techDataFields: Record<string, TechDataFieldDto>
  vendors: Vendor[]
  onFieldCost: (fieldKey: string, cost: number | null) => Promise<void>
  onFieldVendor: (fieldKey: string, vendor: VendorRef) => Promise<void>
  onFieldMode: (fieldKey: string, mode: SourcingMode) => Promise<void>
  onFieldMeta: (fieldKey: string, meta: { label?: string; hidden?: boolean }) => Promise<void>
  onAdd: (input: CustomProcessInput) => Promise<void>
  onUpdate: (customId: string, patch: Partial<CustomProcessInput>) => Promise<void>
  onDelete: (customId: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [newMode, setNewMode] = useState<SourcingMode>('Outsource')
  // Formulas-page Pricing Section C fields (default In-house), then Section D (default Outsource).
  const fields = sourcingFields(techDataFields)
  const { rowCost } = computeWithSourcing(item.technicalData ?? {}, item)
  const manualKeys = new Set(Object.keys(item.outsourcedFieldCosts ?? {}))
  const vendorOf = (key: string) => item.processVendors?.find((pv) => pv.processKey === key)

  // Rows removed from this pulley — listed under the table so they can be restored.
  const removed = fields.filter(({ field }) => isFieldHidden(item, field.key))

  return (
    <>
      {fields.map(({ field: f, home }) => {
        if (isFieldHidden(item, f.key)) return null
        const cost = rowCost[f.key]
        const vendor = vendorOf(f.key)
        const label = fieldLabelFor(item, f)
        const tags = [label !== f.label && 'renamed', manualKeys.has(f.key) && 'manual'].filter(Boolean).join(' · ')
        return (
          <OutsourcedRow
            key={f.key}
            label={label}
            labelEditable
            mode={item.outsourcedFieldModes?.[f.key] ?? HOME_MODE[home]}
            onModeChange={(mode) => onFieldMode(f.key, mode)}
            cost={cost}
            tag={tags || undefined}
            vendorId={vendor?.vendorId ?? ''}
            vendorName={vendor?.vendorName ?? ''}
            vendors={vendors}
            onSave={async (next) => {
              // A name changed here applies to this pulley only ('' = back to the Formulas page name).
              if (next.label !== label) await onFieldMeta(f.key, { label: next.label === f.label ? '' : next.label })
              // An emptied box clears the manual cost (back to the formula).
              if (next.cost !== (cost === undefined ? undefined : round2(cost))) await onFieldCost(f.key, next.cost ?? null)
              if (next.vendor?.id !== (vendor?.vendorId || undefined)) await onFieldVendor(f.key, next.vendor)
            }}
            onReset={manualKeys.has(f.key) ? () => onFieldCost(f.key, null) : undefined}
            onDelete={() =>
              window.confirm(`Remove "${label}" from this pulley? Its cost will no longer count. You can restore it below the table.`)
                ? onFieldMeta(f.key, { hidden: true })
                : Promise.resolve()
            }
          />
        )
      })}

      {(item.customProcesses ?? []).map((c) => (
        <OutsourcedRow
          key={c.id}
          label={c.label}
          labelEditable
          mode={c.mode ?? 'Outsource'}
          onModeChange={(mode) => onUpdate(c.id, { mode })}
          cost={c.cost}
          tag={hasHours(c) ? 'added · from In-House Hours' : 'added'}
          vendorId={c.vendorId}
          vendorName={c.vendorName}
          vendors={vendors}
          onSave={(next) =>
            onUpdate(c.id, {
              label: next.label,
              // Only a changed cost is sent — it replaces any In-House Hours minutes on the row.
              ...(next.cost !== round2(c.cost) ? { cost: next.cost ?? 0 } : {}),
              vendorId: next.vendor?.id ?? '',
              vendorName: next.vendor?.name ?? '',
            })
          }
          onDelete={() => (window.confirm(`Delete "${c.label}" from this pulley?`) ? onDelete(c.id) : Promise.resolve())}
        />
      ))}

      {adding ? (
        <OutsourcedRow
          label=""
          labelEditable
          mode={newMode}
          onModeChange={async (mode) => setNewMode(mode)}
          cost={undefined}
          vendorId=""
          vendorName=""
          vendors={vendors}
          startEditing
          onSave={async (next) => {
            await onAdd({
              label: next.label,
              cost: next.cost ?? 0,
              mode: newMode,
              ...(next.vendor ? { vendorId: next.vendor.id, vendorName: next.vendor.name } : {}),
            })
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <tr>
          <td colSpan={5} className="px-3 py-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={13} />}
              onClick={() => {
                setNewMode('Outsource')
                setAdding(true)
              }}
            >
              Add process
            </Button>
          </td>
        </tr>
      )}

      {removed.length > 0 && (
        <tr>
          <td colSpan={5} className="px-3 py-2 text-xs text-[var(--color-ink-faint)]">
            <span className="mr-2">Removed from this pulley:</span>
            {removed.map(({ field }) => (
              <button
                key={field.key}
                type="button"
                title="Restore this row"
                onClick={() => onFieldMeta(field.key, { hidden: false })}
                className="mb-1 mr-1.5 inline-flex items-center gap-1 rounded border border-dashed border-[var(--color-border)] px-2 py-0.5 hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
              >
                <RotateCcw size={11} />
                {fieldLabelFor(item, field)}
              </button>
            ))}
          </td>
        </tr>
      )}
    </>
  )
}

/** One outsourced row: view mode with ✎ edit (+ ↺ reset / 🗑 delete when given); edit mode
 * with name (added rows), cost and vendor inputs and ✔ update / ✕ cancel. */
function OutsourcedRow({
  label,
  labelEditable = false,
  mode,
  onModeChange,
  cost,
  tag,
  vendorId,
  vendorName,
  vendors,
  startEditing = false,
  onSave,
  onReset,
  onDelete,
  onCancel,
}: {
  label: string
  labelEditable?: boolean
  mode: SourcingMode
  onModeChange: (mode: SourcingMode) => Promise<void>
  cost: number | undefined
  tag?: string
  vendorId: string
  vendorName: string
  vendors: Vendor[]
  startEditing?: boolean
  onSave: (next: { label: string; cost: number | undefined; vendor: VendorRef }) => Promise<void>
  onReset?: () => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const [saving, setSaving] = useState(false)
  const [draftLabel, setDraftLabel] = useState(label)
  const [draftCost, setDraftCost] = useState('')
  const [draftVendorId, setDraftVendorId] = useState(vendorId)

  const beginEdit = () => {
    setDraftLabel(label)
    setDraftCost(cost === undefined ? '' : String(round2(cost)))
    setDraftVendorId(vendorId)
    setEditing(true)
  }
  const cancel = () => {
    setEditing(false)
    onCancel?.()
  }
  const run = async (action: () => Promise<void>) => {
    setSaving(true)
    try {
      await action()
      return true
    } catch {
      return false // the store already showed an error toast
    } finally {
      setSaving(false)
    }
  }
  const update = async () => {
    const name = draftLabel.trim()
    if (labelEditable && !name) {
      useUiStore.getState().pushToast('Enter a process name.', 'error')
      return
    }
    const parsed = draftCost.trim() === '' ? undefined : parseCost(draftCost)
    if (parsed === null) {
      useUiStore.getState().pushToast('Enter a cost of 0 or more.', 'error')
      return
    }
    const v = vendors.find((vv) => vv.id === draftVendorId)
    const ok = await run(() => onSave({ label: name, cost: parsed, vendor: v ? { id: v.id, name: v.name } : null }))
    if (ok) setEditing(false)
  }

  const iconBtn = 'rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] disabled:opacity-30'

  // Same buttons as the standard process rows; a click saves right away.
  const modeButtons = (
    <div className="flex flex-wrap gap-1">
      {SOURCING_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={saving}
          onClick={() => opt !== mode && run(() => onModeChange(opt as SourcingMode))}
          className={clsx(
            'rounded border px-2 py-1 text-[11px] font-medium transition-colors',
            mode === opt
              ? 'border-[var(--color-purple)] bg-[var(--color-purple-50)] text-[var(--color-purple)]'
              : 'border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )

  if (!editing) {
    return (
      <tr className="border-b border-[var(--color-border)]">
        <td className="px-3 py-2 font-medium">
          {label}
          {tag && <span className="ml-1.5 text-[10px] font-normal text-[var(--color-purple)]">{tag}</span>}
        </td>
        <td className="px-3 py-2">{modeButtons}</td>
        <td className="px-3 py-2 text-right">{cost !== undefined ? formatCurrency(cost) : '—'}</td>
        <td className="px-3 py-2 text-[var(--color-ink-soft)]">
          {mode !== 'Outsource' ? (
            <span className="text-[var(--color-ink-faint)]">—</span>
          ) : (
            vendorName || <span className="text-[var(--color-ink-faint)]">Not assigned</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-1">
            <button type="button" title="Edit" onClick={beginEdit} disabled={saving} className={iconBtn}>
              <Pencil size={13} />
            </button>
            {onReset && (
              <button type="button" title="Reset to calculated cost" onClick={() => run(onReset)} disabled={saving} className={iconBtn}>
                <RotateCcw size={13} />
              </button>
            )}
            {onDelete && (
              <button type="button" title="Delete" onClick={() => run(onDelete)} disabled={saving} className={clsx(iconBtn, 'hover:text-red-600')}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-[var(--color-border)] bg-[var(--color-purple-50)]">
      <td className="px-3 py-2">
        {labelEditable ? (
          <input
            autoFocus
            value={draftLabel}
            maxLength={120}
            placeholder="Process name"
            onChange={(e) => setDraftLabel(e.target.value)}
            className={clsx(INPUT_CLASS, 'w-full font-medium')}
          />
        ) : (
          <span className="font-medium">{label}</span>
        )}
      </td>
      <td className="px-3 py-2">{modeButtons}</td>
      <td className="px-3 py-2 text-right">
        <input
          autoFocus={!labelEditable}
          inputMode="decimal"
          value={draftCost}
          placeholder="Cost / unit"
          onChange={(e) => setDraftCost(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') update()
            if (e.key === 'Escape') cancel()
          }}
          className={clsx(INPUT_CLASS, 'w-28 text-right')}
        />
      </td>
      <td className="px-3 py-2">
        <select value={draftVendorId} onChange={(e) => setDraftVendorId(e.target.value)} disabled={mode !== 'Outsource'} className={INPUT_CLASS}>
          <option value="">Not assigned</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button type="button" title="Update" onClick={update} disabled={saving} className={clsx(iconBtn, 'text-green-600')}>
            <Check size={14} />
          </button>
          <button type="button" title="Cancel" onClick={cancel} disabled={saving} className={iconBtn}>
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

