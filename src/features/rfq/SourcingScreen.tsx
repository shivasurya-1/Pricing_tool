import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSpreadsheet, Check, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
import { BOUGHT_OUT_COMPONENTS, PROCESS_SOURCING_MAP, SOURCING_OPTIONS } from '@/data/pulleyTechDataSchema'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { extraLineKey, manualOutsourcedCost, sourcingCostsOf } from '@/lib/outsourcedCosts'
import { useFormulaStore } from '@/store/formulaStore'
import { formatCurrency } from '@/lib/format'
import { SEND_BACK_TARGETS } from '@/lib/workflow'
import type { CustomProcess, RFQItem, Vendor } from '@/types'

export function SourcingScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const vendors = useDataStore((s) => s.vendors)
  // Subscribed (not just read) so a formula saved on the Formulas page re-renders this
  // screen's live per-item cost immediately.
  useFormulaStore((s) => s.formulas)
  useFormulaStore((s) => s.costRates)
  const updateItemTechData = useDataStore((s) => s.updateItemTechData)
  const confirmItemSourcing = useDataStore((s) => s.confirmItemSourcing)
  const assignProcessVendor = useDataStore((s) => s.assignProcessVendor)
  const setProcessCost = useDataStore((s) => s.setProcessCost)
  const addCustomProcess = useDataStore((s) => s.addCustomProcess)
  const updateCustomProcess = useDataStore((s) => s.updateCustomProcess)
  const deleteCustomProcess = useDataStore((s) => s.deleteCustomProcess)
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

  const pricingByItem = new Map(rfq.items.map((item) => [item.id, computePulleyPricing(item.technicalData ?? {}, sourcingCostsOf(item))]))
  const totalDirectCost = [...pricingByItem.values()].reduce((sum, p) => sum + p.totalDirectCost, 0)
  const totalInHouse = [...pricingByItem.values()].reduce((sum, p) => sum + p.totalC * (p.qty || 1), 0)
  const totalOutsourced = [...pricingByItem.values()].reduce((sum, p) => sum + p.totalD * (p.qty || 1), 0)
  const outsourcedCount = rfq.items.reduce(
    (sum, item) =>
      sum + PROCESS_SOURCING_MAP.filter((p) => item.technicalData?.[p.srcKey] === 'Outsource').length + (item.customProcesses?.length ?? 0),
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
          const lineByKey = (key?: string) => (key ? [...pricing.sectionC, ...pricing.sectionD].find((l) => l.key === key) : undefined)

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
                        </tr>
                      </thead>
                      <tbody>
                        {PROCESS_SOURCING_MAP.map((p) => {
                          const mode = String(values[p.srcKey] ?? '')
                          const line = mode === 'Outsource' ? lineByKey(p.dKey ?? extraLineKey(p.srcKey)) : lineByKey(p.cKey)
                          const assignedVendor = item.processVendors?.find((pv) => pv.processKey === p.srcKey)
                          return (
                            <tr key={p.srcKey} className="border-b border-[var(--color-border)]">
                              <td className="px-3 py-2 font-medium">{p.label}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {SOURCING_OPTIONS.map((opt) => (
                                    <button
                                      key={opt}
                                      onClick={() => updateItemTechData(rfq.id, item.id, p.srcKey, opt)}
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
                              </td>
                              <td className="px-3 py-2 text-right">
                                {mode === 'Outsource' ? (
                                  <OutsourcedCostCell
                                    value={line?.value}
                                    manual={manualOutsourcedCost(values, sourcingCostsOf(item), p.srcKey) !== undefined}
                                    disabled={!!item.sourcingConfirmed}
                                    onSave={(cost) => setProcessCost(rfq.id, item.id, p.srcKey, cost)}
                                  />
                                ) : line ? (
                                  formatCurrency(line.value)
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={assignedVendor?.vendorId ?? ''}
                                  onChange={(e) => {
                                    const v = vendors.find((vv) => vv.id === e.target.value)
                                    if (v) assignProcessVendor(rfq.id, item.id, p.srcKey, v.id, v.name)
                                  }}
                                  disabled={mode !== 'Outsource'}
                                  className="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] outline-none disabled:cursor-not-allowed disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-faint)]"
                                >
                                  <option value="">Not assigned</option>
                                  {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          )
                        })}
                        {(item.customProcesses ?? []).map((c) => (
                          <CustomProcessRow
                            key={c.id}
                            process={c}
                            vendors={vendors}
                            disabled={!!item.sourcingConfirmed}
                            onChange={(patch) => updateCustomProcess(rfq.id, item.id, c.id, patch)}
                            onDelete={() => deleteCustomProcess(rfq.id, item.id, c.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <AddCustomProcess
                    vendors={vendors}
                    disabled={!!item.sourcingConfirmed}
                    onAdd={(input) => addCustomProcess(rfq.id, item.id, input)}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
                  <div className="text-xs text-[var(--color-ink-faint)]">
                    Total Direct Cost:{' '}
                    <span className="font-semibold text-[var(--color-ink)]">{formatCurrency(pricing.totalDirectCost)}</span> ({formatCurrency(pricing.totalDirectCostPerUnit)} / unit
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

/** Per-unit cost of an outsourced process — editable; saves on blur / Enter. A manual cost
 * replaces the formula value in Section D; the reset button goes back to the formula value. */
function OutsourcedCostCell({
  value,
  manual,
  disabled,
  onSave,
}: {
  value: number | undefined
  manual: boolean
  disabled: boolean
  onSave: (cost: number | null) => Promise<void>
}) {
  const shown = value !== undefined ? String(Math.round(value * 100) / 100) : ''
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])

  const commit = () => {
    if (draft === shown) return
    if (draft.trim() === '') {
      if (manual) onSave(null).catch(() => setDraft(shown))
      else setDraft(shown)
      return
    }
    const cost = parseCost(draft)
    if (cost === null) {
      useUiStore.getState().pushToast('Enter a cost of 0 or more.', 'error')
      setDraft(shown)
      return
    }
    onSave(cost).catch(() => setDraft(shown))
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {manual && <span className="text-[10px] font-medium text-[var(--color-purple)]">manual</span>}
      <span className="text-[var(--color-ink-faint)]">₹</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(shown)
        }}
        title="Per-unit outsourced cost — counts in Outsourced processing cost (D)"
        className={clsx(INPUT_CLASS, 'w-28 text-right')}
      />
      <button
        type="button"
        onClick={() => onSave(null)}
        disabled={disabled || !manual}
        title="Reset to calculated cost"
        className={clsx('rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] disabled:opacity-30', !manual && 'invisible')}
      >
        <RotateCcw size={12} />
      </button>
    </div>
  )
}

function VendorSelect({ vendors, value, disabled, onChange }: { vendors: Vendor[]; value: string; disabled: boolean; onChange: (v: Vendor | null) => void }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(vendors.find((v) => v.id === e.target.value) ?? null)} className={INPUT_CLASS}>
      <option value="">Not assigned</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  )
}

/** A Sourcing-added outsourced process — an extra Section D line. */
function CustomProcessRow({
  process,
  vendors,
  disabled,
  onChange,
  onDelete,
}: {
  process: CustomProcess
  vendors: Vendor[]
  disabled: boolean
  onChange: (patch: { label?: string; cost?: number; vendorId?: string; vendorName?: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [label, setLabel] = useState(process.label)
  useEffect(() => setLabel(process.label), [process.label])

  const commitLabel = () => {
    const next = label.trim()
    if (!next) {
      setLabel(process.label)
      return
    }
    if (next !== process.label) onChange({ label: next }).catch(() => setLabel(process.label))
  }

  return (
    <tr className="border-b border-[var(--color-border)]">
      <td className="px-3 py-2">
        <input
          value={label}
          disabled={disabled}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={clsx(INPUT_CLASS, 'w-full font-medium')}
        />
      </td>
      <td className="px-3 py-2">
        <Badge tone="purple">Outsource</Badge>
      </td>
      <td className="px-3 py-2 text-right">
        <OutsourcedCostCell value={process.cost} manual={false} disabled={disabled} onSave={(cost) => onChange({ cost: cost ?? 0 })} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <VendorSelect
            vendors={vendors}
            value={process.vendorId}
            disabled={disabled}
            onChange={(v) => onChange({ vendorId: v?.id ?? '', vendorName: v?.name ?? '' })}
          />
          <button
            type="button"
            onClick={() => onDelete()}
            disabled={disabled}
            title="Remove this process"
            className="rounded p-1 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-red-600 disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/** "+ Add outsourced process" — inline form under the processes table. */
function AddCustomProcess({
  vendors,
  disabled,
  onAdd,
}: {
  vendors: Vendor[]
  disabled: boolean
  onAdd: (input: { label: string; cost: number; vendorId?: string; vendorName?: string }) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [cost, setCost] = useState('')
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setOpen(false)
    setLabel('')
    setCost('')
    setVendor(null)
  }

  const submit = async () => {
    const parsed = parseCost(cost)
    if (!label.trim() || parsed === null) {
      useUiStore.getState().pushToast('Enter a process name and a cost of 0 or more.', 'error')
      return
    }
    setSaving(true)
    try {
      await onAdd({ label: label.trim(), cost: parsed, ...(vendor ? { vendorId: vendor.id, vendorName: vendor.name } : {}) })
      reset()
    } catch {
      // the store already showed an error toast
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-2">
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => setOpen(true)} disabled={disabled}>
          Add outsourced process
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] p-2">
      <input
        autoFocus
        value={label}
        maxLength={120}
        placeholder="Process name (e.g. Galvanising)"
        onChange={(e) => setLabel(e.target.value)}
        className={clsx(INPUT_CLASS, 'w-56')}
      />
      <div className="flex items-center gap-1">
        <span className="text-xs text-[var(--color-ink-faint)]">₹</span>
        <input
          inputMode="decimal"
          value={cost}
          placeholder="Cost / unit"
          onChange={(e) => setCost(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className={clsx(INPUT_CLASS, 'w-28 text-right')}
        />
      </div>
      <VendorSelect vendors={vendors} value={vendor?.id ?? ''} disabled={false} onChange={setVendor} />
      <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
        Add
      </Button>
      <Button size="sm" variant="secondary" onClick={reset} disabled={saving}>
        Cancel
      </Button>
    </div>
  )
}
