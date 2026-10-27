import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useDataStore, type RfqDetailsInput } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import type { Priority, RFQ } from '@/types'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'

function Field({ label, children, required, wide }: { label: string; children: ReactNode; required?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
        {label} {required && <span className="text-[var(--color-red)]">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/** "2026-10-01T00:00:00Z" or "2026-10-01" -> "2026-10-01", the value a date input takes. */
const dateOnly = (value: string) => (value ?? '').slice(0, 10)

/**
 * Edits a saved RFQ's details — the same Customer / Project / Commercial / Notes fields as
 * the New RFQ form — at any stage. Pulleys are edited on the Items tab. Every change is
 * recorded in the RFQ's Activity history by the backend.
 */
export function RfqDetailsEditModal({ rfq, open, onClose }: { rfq: RFQ; open: boolean; onClose: () => void }) {
  const customers = useDataStore((s) => s.customers)
  const updateRfqDetails = useDataStore((s) => s.updateRfqDetails)
  const userName = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const initial = (): Required<RfqDetailsInput> => ({
    customerId: rfq.customerId,
    contactPerson: rfq.contactPerson,
    contactEmail: rfq.contactEmail,
    contactPhone: rfq.contactPhone,
    customerReference: rfq.customerReference,
    rfqReceivedDate: dateOnly(rfq.rfqReceivedDate),
    projectName: rfq.projectName,
    projectCode: rfq.projectCode,
    quoteReference: rfq.quoteReference,
    endCustomer: rfq.endCustomer,
    location: rfq.location,
    industry: rfq.industry,
    requiredDeliveryDate: dateOnly(rfq.requiredDeliveryDate),
    priority: rfq.priority,
    currency: rfq.currency,
    paymentTerms: rfq.paymentTerms,
    deliveryTerms: rfq.deliveryTerms,
    quotationValidity: rfq.quotationValidity,
    incoterms: rfq.incoterms,
    taxApplicability: rfq.taxApplicability,
    freightRequirement: rfq.freightRequirement,
    customerRemarks: rfq.customerRemarks,
    internalNotes: rfq.internalNotes,
    customerNotes: rfq.customerNotes,
  })
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (key: keyof RfqDetailsInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const text = (key: keyof RfqDetailsInput) => <input value={String(form[key] ?? '')} onChange={set(key)} className={inputClass} />

  const save = async () => {
    if (!form.projectName.trim()) {
      pushToast('Project Name is required.', 'error')
      return
    }
    // Only send what changed, so the Activity history lists exactly the real edits.
    const start = initial()
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== start[k as keyof RfqDetailsInput])) as RfqDetailsInput
    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await updateRfqDetails(rfq.id, changed, userName)
      pushToast(`${rfq.rfqNumber} details saved.`, 'success')
      onClose()
    } catch {
      // withErrorToast already showed the error; keep the form open.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${rfq.rfqNumber}`}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      {rfq.stage !== 'Draft' && (
        <p className="mb-4 rounded-md border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-3 py-2 text-xs text-[var(--color-amber)]">
          This RFQ is at the <b>{rfq.stage}</b> stage. Changes are recorded in its Activity history; a quotation already generated or sent
          is not changed — download or send it again to include them.
        </p>
      )}

      <Section title="Customer Information">
        <Field label="Customer" required>
          <select value={form.customerId} onChange={set('customerId')} className={inputClass}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contact Person">{text('contactPerson')}</Field>
        <Field label="Email">{text('contactEmail')}</Field>
        <Field label="Phone">{text('contactPhone')}</Field>
        <Field label="Customer Reference">{text('customerReference')}</Field>
        <Field label="RFQ Received Date">
          <input type="date" value={form.rfqReceivedDate} onChange={set('rfqReceivedDate')} className={inputClass} />
        </Field>
      </Section>

      <Section title="Project Information">
        <Field label="Project Name" required>
          {text('projectName')}
        </Field>
        <Field label="Project Code">{text('projectCode')}</Field>
        <Field label="Quote Reference">{text('quoteReference')}</Field>
        <Field label="End Customer">{text('endCustomer')}</Field>
        <Field label="Location">{text('location')}</Field>
        <Field label="Industry">{text('industry')}</Field>
        <Field label="Required Delivery Date">
          <input type="date" value={form.requiredDeliveryDate} onChange={set('requiredDeliveryDate')} className={inputClass} />
        </Field>
        <Field label="Priority">
          <select value={form.priority} onChange={set('priority')} className={inputClass}>
            {(['Low', 'Medium', 'High', 'Urgent'] as Priority[]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Commercial Requirements">
        <Field label="Currency">
          <select value={form.currency} onChange={set('currency')} className={inputClass}>
            {['INR', 'USD', 'EUR'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment Terms">{text('paymentTerms')}</Field>
        <Field label="Delivery Terms">{text('deliveryTerms')}</Field>
        <Field label="Quotation Validity">{text('quotationValidity')}</Field>
        <Field label="Incoterms">{text('incoterms')}</Field>
        <Field label="Tax Applicability">{text('taxApplicability')}</Field>
        <Field label="Freight Requirement">{text('freightRequirement')}</Field>
        <Field label="Customer Remarks" wide>
          <textarea value={form.customerRemarks} onChange={set('customerRemarks')} rows={2} className={inputClass} />
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="Internal Notes">
          <textarea value={form.internalNotes} onChange={set('internalNotes')} rows={3} className={inputClass} />
        </Field>
        <Field label="Customer Notes">
          <textarea value={form.customerNotes} onChange={set('customerNotes')} rows={3} className={inputClass} />
        </Field>
      </Section>
    </Modal>
  )
}
