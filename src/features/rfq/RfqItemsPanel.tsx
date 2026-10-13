import { useState } from 'react'
import { Plus, Copy, Trash2, FileSpreadsheet } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useFormulaStore } from '@/store/formulaStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PulleyTechDataForm, isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { applyFieldChange, applyFixedValues } from '@/lib/pulleyTechDataCalc'
import { useTechDataSections } from '@/data/pulleyTechDataSchema'
import { canRoleActOnStage } from '@/lib/workflow'
import { formatCurrency } from '@/lib/format'
import type { PulleyTechDataValues, RFQ, RFQItem, Stage } from '@/types'

/** Mirrors the backend's ITEM_EDITABLE_STAGES (rfq/views.py): pulleys can be added,
 * duplicated and removed on a saved RFQ until a quotation is generated. */
const ITEM_EDITABLE_STAGES: Stage[] = ['Draft', 'Operations Review', 'Sourcing', 'Controlling', 'Approval Pending', 'Approved']

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

/** The Items tab of a saved RFQ: its pulleys, plus Add / Duplicate / Remove and filling
 * each pulley's Technical Data Sheet — for whoever owns the RFQ's current stage. */
export function RfqItemsPanel({ rfq }: { rfq: RFQ }) {
  const products = useDataStore((s) => s.products)
  const addRfqItem = useDataStore((s) => s.addRfqItem)
  const duplicateRfqItem = useDataStore((s) => s.duplicateRfqItem)
  const removeRfqItem = useDataStore((s) => s.removeRfqItem)
  const saveItemTechData = useDataStore((s) => s.saveItemTechData)
  const role = useAuthStore((s) => s.role)
  const userName = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)
  const techDataSections = useTechDataSections()

  const editable = ITEM_EDITABLE_STAGES.includes(rfq.stage) && canRoleActOnStage(role, rfq.stage)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingProductId, setPendingProductId] = useState('')
  const [busy, setBusy] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<RFQItem | null>(null)
  // The pulley whose Technical Data Sheet is open, and its unsaved edits.
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PulleyTechDataValues>({})
  const drawerItem = rfq.items.find((it) => it.id === drawerItemId)

  const openTechData = (item: RFQItem) => {
    setDraft(item.technicalData ?? {})
    setDrawerItemId(item.id)
    // Catalog options may have changed since the page loaded.
    void useFormulaStore.getState().loadTechDataFields()
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      return true
    } catch {
      return false // withErrorToast already showed the error
    } finally {
      setBusy(false)
    }
  }

  const confirmAdd = async () => {
    const product = products.find((p) => p.id === pendingProductId)
    if (!product) {
      pushToast('Please select a pulley product.', 'error')
      return
    }
    let updated: RFQ | undefined
    const ok = await run(async () => {
      updated = await addRfqItem(rfq.id, { productId: product.id, quantity: 1, technicalData: applyFixedValues({ qty: 1 }, techDataSections) }, userName)
    })
    if (!ok || !updated) return
    setPickerOpen(false)
    setPendingProductId('')
    pushToast(`${product.name} added to ${rfq.rfqNumber}.`, 'success')
    const added = [...updated.items].sort((a, b) => b.itemNo - a.itemNo)[0]
    if (added) openTechData(added)
  }

  const duplicate = async (item: RFQItem) => {
    if (await run(() => duplicateRfqItem(rfq.id, item.id, userName))) pushToast(`Pulley #${item.itemNo} duplicated.`, 'success')
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    const target = removeTarget
    setRemoveTarget(null)
    if (await run(() => removeRfqItem(rfq.id, target.id, userName))) pushToast(`Pulley #${target.itemNo} removed.`, 'success')
  }

  const saveTechData = async () => {
    if (!drawerItem) return
    if (await run(() => saveItemTechData(rfq.id, drawerItem.id, draft))) {
      pushToast(`Technical data saved for pulley #${drawerItem.itemNo}.`, 'success')
      setDrawerItemId(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {rfq.items.length} {rfq.items.length === 1 ? 'pulley' : 'pulleys'} on this RFQ
          {!editable && ITEM_EDITABLE_STAGES.includes(rfq.stage) && (
            <span className="text-[var(--color-ink-faint)]"> — only the {rfq.stage} owner can change pulleys at this stage</span>
          )}
          {!ITEM_EDITABLE_STAGES.includes(rfq.stage) && <span className="text-[var(--color-ink-faint)]"> — locked once a quotation is generated</span>}
        </p>
        {editable && (
          <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setPickerOpen(true)} disabled={busy}>
            Add Pulley
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Pulley Tag / Name</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Specification</th>
              <th className="px-2 py-2 text-right">Target Price</th>
              <th className="px-2 py-2">Technical Data</th>
              {editable && <th className="px-2 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rfq.items.map((item) => {
              const captured = isTechDataFilled(item.technicalData)
              return (
                <tr key={item.id} className="border-b border-[var(--color-border)]">
                  <td className="px-2 py-2.5 text-[var(--color-ink-faint)]">{item.itemNo}</td>
                  <td className="px-2 py-2.5 font-medium">{item.productName}</td>
                  <td className="px-2 py-2.5 text-[var(--color-ink-soft)]">{String(item.technicalData?.pulleyTag ?? '—')}</td>
                  <td className="px-2 py-2.5">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-2 py-2.5 text-[var(--color-ink-soft)]">{item.specification || '—'}</td>
                  <td className="px-2 py-2.5 text-right">{formatCurrency(item.targetPrice, rfq.currency)}</td>
                  <td className="px-2 py-2.5">
                    {editable ? (
                      <Button size="sm" variant={captured ? 'secondary' : 'primary'} icon={<FileSpreadsheet size={13} />} onClick={() => openTechData(item)}>
                        {captured ? 'Edit' : 'Fill from Customer'}
                      </Button>
                    ) : null}
                    {captured ? (
                      <Badge tone="green" className={editable ? 'ml-1.5' : undefined}>
                        Captured
                      </Badge>
                    ) : (
                      !editable && <Badge tone="neutral">Not captured</Badge>
                    )}
                  </td>
                  {editable && (
                    <td className="px-2 py-2.5">
                      <div className="flex gap-1">
                        <button
                          onClick={() => duplicate(item)}
                          disabled={busy}
                          className="rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] disabled:opacity-50"
                          title="Duplicate pulley"
                          aria-label={`Duplicate pulley ${item.itemNo}`}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => setRemoveTarget(item)}
                          disabled={busy || rfq.items.length <= 1}
                          className="rounded p-1.5 text-[var(--color-red)] hover:bg-[var(--color-red-50)] disabled:cursor-not-allowed disabled:opacity-40"
                          title={rfq.items.length <= 1 ? 'An RFQ needs at least one pulley' : 'Remove pulley'}
                          aria-label={`Remove pulley ${item.itemNo}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add Pulley"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmAdd} disabled={busy}>
              Next: Fill Technical Data
            </Button>
          </>
        }
      >
        <label htmlFor="add-pulley-product" className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">
          Pulley Product
        </label>
        <select id="add-pulley-product" value={pendingProductId} onChange={(e) => setPendingProductId(e.target.value)} className={inputClass}>
          <option value="">Select pulley product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          The pulley is added as #{rfq.items.length + 1}, then its Technical Data Sheet opens so you can capture the customer's specification.
        </p>
      </Modal>

      <Drawer
        open={!!drawerItem}
        onClose={() => setDrawerItemId(null)}
        title={drawerItem ? `Technical Data — #${drawerItem.itemNo} ${drawerItem.productName}` : 'Technical Data'}
        width="max-w-3xl"
      >
        {drawerItem && (
          <div>
            <p className="mb-4 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-xs text-[var(--color-blue)]">
              Capture these values directly from the customer — this mirrors the client's Technical Data Sheet exactly.
            </p>
            <PulleyTechDataForm
              values={draft}
              onChange={(key, value) => setDraft((prev) => applyFieldChange(prev, key, value))}
              fieldOverrides={drawerItem.fieldOverrides}
            />
            <div className="sticky bottom-0 mt-5 flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-alt)] pt-3">
              <Button variant="secondary" onClick={() => setDrawerItemId(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveTechData} disabled={busy}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        title="Remove Pulley"
        description={
          removeTarget
            ? `Remove pulley #${removeTarget.itemNo} (${removeTarget.productName}${removeTarget.technicalData?.pulleyTag ? `, ${removeTarget.technicalData.pulleyTag}` : ''}) from ${rfq.rfqNumber}? Its technical data and pricing will be deleted.`
            : ''
        }
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}
