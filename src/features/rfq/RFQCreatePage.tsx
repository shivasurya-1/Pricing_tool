import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Copy, Paperclip, X, FileSpreadsheet } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { PulleyTechDataForm, isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { applyFieldChange } from '@/lib/pulleyTechDataCalc'
import type { Priority, RFQItem } from '@/types'
import { formatDate } from '@/lib/format'

function summarizeTechData(values: RFQItem['technicalData']): string {
  if (!values) return ''
  const parts: string[] = []
  if (values.shellOD) parts.push(`OD ${values.shellOD}mm`)
  if (values.shaftMaterial) parts.push(`Shaft ${values.shaftMaterial}`)
  if (values.bearing1Designation) parts.push(`Brg ${values.bearing1Designation}`)
  return parts.join(' · ')
}

function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
        {label} {required && <span className="text-[var(--color-red)]">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'

export function RFQCreatePage() {
  const navigate = useNavigate()
  const customers = useDataStore((s) => s.customers)
  const products = useDataStore((s) => s.products)
  const createRFQ = useDataStore((s) => s.createRFQ)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const [customerId, setCustomerId] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [rfqReceivedDate, setRfqReceivedDate] = useState(new Date().toISOString().slice(0, 10))

  const [projectName, setProjectName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [quoteReference, setQuoteReference] = useState('')
  const [endCustomer, setEndCustomer] = useState('')
  const [location, setLocation] = useState('')
  const [industry, setIndustry] = useState('Mining & Materials Handling')
  const [requiredDeliveryDate, setRequiredDeliveryDate] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')

  const [currency, setCurrency] = useState('INR')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [deliveryTerms, setDeliveryTerms] = useState('Ex-works + freight')
  const [quotationValidity, setQuotationValidity] = useState('30 days')
  const [incoterms, setIncoterms] = useState('FOR Destination')
  const [taxApplicability, setTaxApplicability] = useState('GST Applicable')
  const [freightRequirement, setFreightRequirement] = useState('To be arranged by supplier')
  const [customerRemarks, setCustomerRemarks] = useState('')

  const [items, setItems] = useState<Omit<RFQItem, 'id' | 'itemNo'>[]>([])
  const [attachments, setAttachments] = useState<string[]>([])
  const [internalNotes, setInternalNotes] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')

  const selectedCustomer = customers.find((c) => c.id === customerId)

  const handleCustomerChange = (id: string) => {
    setCustomerId(id)
    const c = customers.find((x) => x.id === id)
    if (c) {
      setContactPerson(c.contact)
      setContactEmail(c.email)
      setContactPhone(c.phone)
      setPaymentTerms(c.paymentTerms)
      setEndCustomer(c.name)
      setLocation(c.city)
    }
  }

  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [pendingProductId, setPendingProductId] = useState('')
  const [techDataDrawerIndex, setTechDataDrawerIndex] = useState<number | null>(null)

  const confirmAddPulley = () => {
    const p = products.find((x) => x.id === pendingProductId)
    if (!p) {
      pushToast('Please select a pulley product.', 'error')
      return
    }
    const newItem: Omit<RFQItem, 'id' | 'itemNo'> = {
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      description: p.description,
      quantity: 1,
      unit: p.unit,
      specification: '',
      requiredDelivery: requiredDeliveryDate || new Date().toISOString().slice(0, 10),
      targetPrice: p.basePrice,
      remarks: '',
      technicalData: { pulleyTag: `pulley_${items.length + 1}`, qty: 1 },
    }
    setItems((prev) => [...prev, newItem])
    setTechDataDrawerIndex(items.length)
    setProductPickerOpen(false)
    setPendingProductId('')
  }

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))
  const duplicateItem = (index: number) => setItems((prev) => [...prev.slice(0, index + 1), { ...prev[index] }, ...prev.slice(index + 1)])

  const updateTechDataField = (index: number, fieldKey: string, value: string | number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        const technicalData = applyFieldChange(it.technicalData ?? {}, fieldKey, value)
        const patch: Partial<RFQItem> = { technicalData, specification: summarizeTechData(technicalData) }
        if (fieldKey === 'qty') patch.quantity = Number(value) || it.quantity
        return { ...it, ...patch }
      }),
    )
  }

  const validate = (): string | null => {
    if (!customerId) return 'Please select a customer.'
    if (!projectName) return 'Project name is required.'
    if (items.length === 0) return 'Add at least one RFQ item.'
    return null
  }

  const buildInput = () => ({
    customerId,
    contactPerson,
    contactEmail,
    contactPhone,
    customerReference,
    rfqReceivedDate: new Date(rfqReceivedDate).toISOString(),
    projectName,
    projectCode,
    quoteReference,
    endCustomer: endCustomer || selectedCustomer?.name || '',
    location,
    industry,
    requiredDeliveryDate: requiredDeliveryDate ? new Date(requiredDeliveryDate).toISOString() : new Date().toISOString(),
    priority,
    currency,
    paymentTerms,
    deliveryTerms,
    quotationValidity,
    incoterms,
    taxApplicability,
    freightRequirement,
    customerRemarks,
    items,
    internalNotes,
    customerNotes,
  })

  const saveDraft = () => {
    if (!customerId) {
      pushToast('Please select a customer before saving.', 'error')
      return
    }
    const rfq = createRFQ(buildInput(), name, false)
    pushToast(`${rfq.rfqNumber} saved as draft.`, 'success')
    navigate(`/rfqs/${rfq.id}`)
  }

  const submit = () => {
    const error = validate()
    if (error) {
      pushToast(error, 'error')
      return
    }
    const rfq = createRFQ(buildInput(), name, true)
    pushToast(`${rfq.rfqNumber} submitted for Operations review.`, 'success')
    navigate(`/rfqs/${rfq.id}`)
  }

  return (
    <div>
      <PageHeader
        title="Create RFQ"
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: 'Create RFQ' }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/rfqs')}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={saveDraft}>
              Save Draft
            </Button>
            <Button variant="primary" onClick={submit}>
              Submit RFQ
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="1. Customer Information" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer" required>
              <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)} className={inputClass}>
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer Code">
              <input value={selectedCustomer?.code ?? ''} readOnly className={inputClass + ' bg-[var(--color-surface)]'} />
            </Field>
            <Field label="Contact Person">
              <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email">
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Phone">
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Customer Reference">
              <input value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} className={inputClass} />
            </Field>
            <Field label="RFQ Received Date">
              <input type="date" value={rfqReceivedDate} onChange={(e) => setRfqReceivedDate(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="2. Project Information" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Project Name" required>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Project Code">
              <input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Quote Reference">
              <input value={quoteReference} onChange={(e) => setQuoteReference(e.target.value)} className={inputClass} />
            </Field>
            <Field label="End Customer">
              <input value={endCustomer} onChange={(e) => setEndCustomer(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Industry">
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Required Delivery Date">
              <input type="date" value={requiredDeliveryDate} onChange={(e) => setRequiredDeliveryDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputClass}>
                {(['Low', 'Medium', 'High', 'Urgent'] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="3. Commercial Requirements" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {['INR', 'USD', 'EUR'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment Terms">
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Delivery Terms">
              <input value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Quotation Validity">
              <input value={quotationValidity} onChange={(e) => setQuotationValidity(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Incoterms">
              <input value={incoterms} onChange={(e) => setIncoterms(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Tax Applicability">
              <input value={taxApplicability} onChange={(e) => setTaxApplicability(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Freight Requirement">
              <input value={freightRequirement} onChange={(e) => setFreightRequirement(e.target.value)} className={inputClass} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Customer Remarks">
                <textarea value={customerRemarks} onChange={(e) => setCustomerRemarks(e.target.value)} rows={2} className={inputClass} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="4. RFQ Items"
            description="Select a pulley, then capture its full spec straight from the customer"
            action={
              <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setProductPickerOpen(true)}>
                Add Pulley
              </Button>
            }
          />
          <div className="overflow-x-auto p-4">
            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-ink-faint)]">No pulleys added yet. Click "Add Pulley" to select one and capture its technical data.</p>
            ) : (
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Pulley Product</th>
                    <th className="px-2 py-2">Pulley Tag / Name</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2">Technical Data</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-[var(--color-border)]">
                      <td className="px-2 py-2 text-[var(--color-ink-faint)]">{i + 1}</td>
                      <td className="px-2 py-2 font-medium">{item.productName}</td>
                      <td className="px-2 py-2 text-[var(--color-ink-soft)]">{String(item.technicalData?.pulleyTag ?? '—')}</td>
                      <td className="px-2 py-2">{item.technicalData?.qty ?? item.quantity}</td>
                      <td className="px-2 py-2">
                        <Button
                          size="sm"
                          variant={isTechDataFilled(item.technicalData) ? 'secondary' : 'primary'}
                          icon={<FileSpreadsheet size={13} />}
                          onClick={() => setTechDataDrawerIndex(i)}
                        >
                          {isTechDataFilled(item.technicalData) ? 'Edit' : 'Fill from Customer'}
                        </Button>
                        {isTechDataFilled(item.technicalData) && (
                          <Badge tone="green" className="ml-1.5">
                            Captured
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => duplicateItem(i)} className="rounded p-1.5 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)]" title="Duplicate">
                            <Copy size={14} />
                          </button>
                          <button onClick={() => removeItem(i)} className="rounded p-1.5 text-[var(--color-red)] hover:bg-[var(--color-red-50)]" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="5. Attachments" description="Frontend placeholder — no backend storage in this prototype" />
          <div className="space-y-2 p-4">
            {attachments.map((name, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Paperclip size={14} className="text-[var(--color-ink-faint)]" /> {name}
                </span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} className="text-[var(--color-ink-faint)] hover:text-[var(--color-red)]">
                  <X size={14} />
                </button>
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              icon={<Paperclip size={13} />}
              onClick={() => setAttachments((prev) => [...prev, `Customer_Drawing_${prev.length + 1}.pdf`])}
            >
              Add Attachment
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="6. Notes" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Internal Notes">
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} className={inputClass} />
            </Field>
            <Field label="Customer Notes">
              <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} className={inputClass} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-0 mt-5 flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] py-3">
        <span className="mr-auto self-center text-xs text-[var(--color-ink-faint)]">RFQ received: {formatDate(new Date(rfqReceivedDate).toISOString())}</span>
        <Button variant="secondary" onClick={() => navigate('/rfqs')}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={saveDraft}>
          Save Draft
        </Button>
        <Button variant="primary" onClick={submit}>
          Submit RFQ
        </Button>
      </div>

      <Modal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Select Pulley"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProductPickerOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmAddPulley}>
              Next: Fill Technical Data
            </Button>
          </>
        }
      >
        <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">Pulley Product</label>
        <select value={pendingProductId} onChange={(e) => setPendingProductId(e.target.value)} className={inputClass}>
          <option value="">Select pulley product...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          Once selected, the Technical Data Sheet opens so you can capture the customer's full specification.
        </p>
      </Modal>

      <Drawer
        open={techDataDrawerIndex !== null}
        onClose={() => setTechDataDrawerIndex(null)}
        title={techDataDrawerIndex !== null ? `Technical Data — ${items[techDataDrawerIndex]?.productName || `Item ${techDataDrawerIndex + 1}`}` : 'Technical Data'}
        width="max-w-3xl"
      >
        {techDataDrawerIndex !== null && (
          <div>
            <p className="mb-4 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-xs text-[var(--color-blue)]">
              Capture these values directly from the customer — this mirrors the client's Technical Data Sheet exactly.
            </p>
            <PulleyTechDataForm
              values={items[techDataDrawerIndex].technicalData ?? {}}
              onChange={(key, value) => updateTechDataField(techDataDrawerIndex, key, value)}
            />
            <div className="sticky bottom-0 mt-5 flex justify-end border-t border-[var(--color-border)] bg-[var(--color-surface-alt)] pt-3">
              <Button variant="primary" onClick={() => setTechDataDrawerIndex(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
