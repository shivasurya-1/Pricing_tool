import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { EmptyState } from '@/components/EmptyState'
import { SendBackModal } from '@/components/workflow/SendBackModal'
import { RejectModal } from '@/components/workflow/RejectModal'
import { PulleyTechDataView } from '@/components/pulley/PulleyTechDataView'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { formatCurrency, formatDate } from '@/lib/format'
import { SEND_BACK_TARGETS } from '@/lib/workflow'
import type { OperationsReview, RFQItem } from '@/types'
import { FileSpreadsheet } from 'lucide-react'

const FEASIBILITY: NonNullable<OperationsReview['technicalFeasibility']>[] = ['Feasible', 'Feasible with Conditions', 'Not Feasible']
const DELIVERY: NonNullable<OperationsReview['delivery']>[] = ['Available', 'Partial', 'Need sourcing', 'Not available']
const COMMERCIAL: NonNullable<OperationsReview['commercialReview']>[] = ['Acceptable', 'Requires clarification']

function ChoiceGroup<T extends string>({ options, value, onChange }: { options: T[]; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt ? 'border-[var(--color-teal)] bg-[var(--color-teal-50)] text-[var(--color-teal)]' : 'border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export function OperationsReviewScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const saveOperationsReview = useDataStore((s) => s.saveOperationsReview)
  const approveOperations = useDataStore((s) => s.approveOperations)
  const sendBack = useDataStore((s) => s.sendBack)
  const rejectRFQ = useDataStore((s) => s.rejectRFQ)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const rfq = rfqs.find((r) => r.id === id)
  const [feasibility, setFeasibility] = useState<OperationsReview['technicalFeasibility'] | undefined>(rfq?.operationsReview?.technicalFeasibility)
  const [delivery, setDelivery] = useState<OperationsReview['delivery'] | undefined>(rfq?.operationsReview?.delivery)
  const [commercial, setCommercial] = useState<OperationsReview['commercialReview'] | undefined>(rfq?.operationsReview?.commercialReview)
  const [notes, setNotes] = useState(rfq?.operationsReview?.notes ?? '')
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [techDataItem, setTechDataItem] = useState<RFQItem | null>(null)

  if (!rfq) return <EmptyState title="RFQ not found" />
  if (rfq.stage !== 'Operations Review') {
    return (
      <EmptyState
        title="This RFQ is no longer awaiting Operations review"
        description={`Current stage: ${rfq.stage}`}
        action={<Button onClick={() => navigate(`/rfqs/${rfq.id}`)}>View RFQ</Button>}
      />
    )
  }

  const canApprove = feasibility && delivery && commercial

  const handleApprove = () => {
    if (!canApprove) {
      pushToast('Please complete all three checks before approving.', 'error')
      return
    }
    saveOperationsReview(rfq.id, { technicalFeasibility: feasibility, delivery, commercialReview: commercial, notes })
    approveOperations(rfq.id, name)
    pushToast('Operations review approved.', 'success')
    navigate('/rfqs')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: rfq.rfqNumber, to: `/rfqs/${rfq.id}` }, { label: 'Operations Review' }]}
        title={`Operations Review — ${rfq.rfqNumber}`}
        description={`${rfq.endCustomer} · ${rfq.projectName}`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="RFQ Items" description={`${rfq.items.length} item(s) · Value ${formatCurrency(rfq.value, rfq.currency)}`} />
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2">Required Delivery</th>
                  <th className="px-4 py-2">Specification</th>
                  <th className="px-4 py-2">Technical Data</th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-2.5 font-medium">{item.productName}</td>
                    <td className="px-4 py-2.5">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-4 py-2.5">{formatDate(item.requiredDelivery)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-ink-soft)]">{item.specification}</td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm"
                        variant={isTechDataFilled(item.technicalData) ? 'secondary' : 'ghost'}
                        icon={<FileSpreadsheet size={13} />}
                        onClick={() => setTechDataItem(item)}
                        disabled={!isTechDataFilled(item.technicalData)}
                      >
                        {isTechDataFilled(item.technicalData) ? 'View Spec' : 'Not captured'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <CardHeader title="Commercial Requirements" />
            <div className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-3">
              <Stat label="Payment Terms" value={rfq.paymentTerms} />
              <Stat label="Delivery Terms" value={rfq.deliveryTerms} />
              <Stat label="Incoterms" value={rfq.incoterms} />
              <Stat label="Priority" value={rfq.priority} />
              <Stat label="Customer Remarks" value={rfq.customerRemarks || '—'} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Review Checks" />
            <div className="space-y-4 p-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-ink-soft)]">Technical feasibility</p>
                <ChoiceGroup options={FEASIBILITY} value={feasibility} onChange={setFeasibility} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-ink-soft)]">Delivery</p>
                <ChoiceGroup options={DELIVERY} value={delivery} onChange={setDelivery} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-ink-soft)]">Commercial review</p>
                <ChoiceGroup options={COMMERCIAL} value={commercial} onChange={setCommercial} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--color-ink-soft)]">Internal notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Feasibility notes, stock checks, clarifications needed..."
                  className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Decision" />
            <div className="flex flex-col gap-2 p-4">
              <Button variant="primary" onClick={handleApprove}>
                Approve & Continue
              </Button>
              <Button variant="secondary" onClick={() => setSendBackOpen(true)}>
                Send Back
              </Button>
              <Button variant="danger" onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <SendBackModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        targets={SEND_BACK_TARGETS['Operations Review'] ?? []}
        onConfirm={(target, comment) => {
          sendBack(rfq.id, target, 'Operations', name, comment)
          pushToast(`${rfq.rfqNumber} sent back with comments.`, 'warning')
          navigate('/rfqs')
        }}
      />
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        rfq={rfq}
        onConfirm={(reason, comment) => {
          rejectRFQ(rfq.id, 'Operations', name, reason, comment)
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
      <p className="mt-0.5 font-medium text-[var(--color-ink)]">{value}</p>
    </div>
  )
}
