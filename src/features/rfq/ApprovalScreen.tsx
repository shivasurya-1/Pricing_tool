import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Drawer } from '@/components/ui/Drawer'
import { EmptyState } from '@/components/EmptyState'
import { PriorityBadge } from '@/components/PriorityBadge'
import { SendBackModal } from '@/components/workflow/SendBackModal'
import { RejectModal } from '@/components/workflow/RejectModal'
import { PulleyTechDataView } from '@/components/pulley/PulleyTechDataView'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { PulleySourcingSummary } from '@/components/pulley/PulleySourcingSummary'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { SEND_BACK_TARGETS } from '@/lib/workflow'
import { marginStatus, marginStatusColor, summarizeCostBreakdown } from '@/lib/pricing'
import { FileSpreadsheet } from 'lucide-react'
import type { RFQItem } from '@/types'

const TABS = ['RFQ Details', 'Items', 'Sourcing', 'Commercials', 'Terms', 'History']

export function ApprovalScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const auditLog = useDataStore((s) => s.auditLog)
  const approveFinal = useDataStore((s) => s.approveFinal)
  const sendBack = useDataStore((s) => s.sendBack)
  const rejectRFQ = useDataStore((s) => s.rejectRFQ)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const [tab, setTab] = useState('RFQ Details')
  const [decisionComment, setDecisionComment] = useState('')
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [techDataItem, setTechDataItem] = useState<RFQItem | null>(null)

  const rfq = rfqs.find((r) => r.id === id)
  const rfqAudit = useMemo(() => auditLog.filter((a) => a.rfqId === id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), [auditLog, id])

  if (!rfq) return <EmptyState title="RFQ not found" />
  if (rfq.stage !== 'Approval Pending') {
    return <EmptyState title="This RFQ is not awaiting approval" description={`Current stage: ${rfq.stage}`} action={<Button onClick={() => navigate(`/rfqs/${rfq.id}`)}>View RFQ</Button>} />
  }

  const summary = summarizeCostBreakdown(rfq.costBreakdown)
  const status = marginStatus(summary.marginPercent, rfq.targetMarginPercent)

  const handleApprove = () => {
    approveFinal(rfq.id, name, decisionComment || undefined)
    pushToast('Final quotation approved.', 'success')
    navigate('/rfqs')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: rfq.rfqNumber, to: `/rfqs/${rfq.id}` }, { label: 'Approval' }]}
        title={`Final Approval — ${rfq.rfqNumber}`}
        description={`${rfq.endCustomer} · Quotation value ${formatCurrency(rfq.value, rfq.currency)}`}
        actions={<PriorityBadge priority={rfq.priority} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Cost" value={formatCurrency(summary.totalCost)} />
        <Stat label="Selling Price" value={formatCurrency(summary.totalSellingPrice)} />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Margin</p>
          <p className={clsx('mt-1 inline-block rounded border px-2 py-0.5 text-sm font-semibold', marginStatusColor[status])}>{summary.marginPercent.toFixed(1)}%</p>
        </div>
        <Stat label="Tax" value={formatCurrency(summary.totalTax)} />
        <Stat label="Grand Total" value={formatCurrency(summary.grandTotal)} bold />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="p-4">
            {tab === 'RFQ Details' && (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Stat label="Customer" value={rfq.endCustomer} />
                <Stat label="Project" value={rfq.projectName} />
                <Stat label="Sales Owner" value={rfq.salesPerson} />
                <Stat label="Location" value={rfq.location} />
                <Stat label="Currency" value={rfq.currency} />
                <Stat label="Priority" value={rfq.priority} />
              </div>
            )}
            {tab === 'Items' && (
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Qty</th>
                    <th className="px-2 py-2 text-right">Final Price</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rfq.items.map((item) => {
                    const line = rfq.costBreakdown.find((l) => l.itemId === item.id)
                    return (
                      <tr key={item.id} className="border-b border-[var(--color-border)]">
                        <td className="px-2 py-2.5 font-medium">{item.productName}</td>
                        <td className="px-2 py-2.5">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-2 py-2.5 text-right">{line ? formatCurrency(line.finalPrice) : '—'}</td>
                        <td className="px-2 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<FileSpreadsheet size={13} />}
                            onClick={() => setTechDataItem(item)}
                            disabled={!isTechDataFilled(item.technicalData)}
                          >
                            View Spec
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {tab === 'Sourcing' && (
              <div className="space-y-5 text-sm">
                {rfq.items.map((item) => (
                  <PulleySourcingSummary key={item.id} item={item} />
                ))}
                {rfq.sourcingComments && <p className="border-t border-[var(--color-border)] pt-3 text-[var(--color-ink-soft)]">{rfq.sourcingComments}</p>}
              </div>
            )}
            {tab === 'Commercials' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Freight" value={formatCurrency(summary.totalFreight)} />
                <Stat label="Discount" value={formatCurrency(summary.totalDiscount)} />
                <Stat label="Tax" value={formatCurrency(summary.totalTax)} />
              </div>
            )}
            {tab === 'Terms' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Payment Terms" value={rfq.paymentTerms} />
                <Stat label="Delivery Terms" value={rfq.deliveryTerms} />
                <Stat label="Incoterms" value={rfq.incoterms} />
                <Stat label="Validity" value={rfq.quotationValidity} />
                <Stat label="Tax Applicability" value={rfq.taxApplicability} />
              </div>
            )}
            {tab === 'History' && (
              <div className="space-y-3">
                {rfqAudit.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-2.5 text-sm">
                    <div>
                      <p className="font-medium">{a.action}</p>
                      <p className="text-xs text-[var(--color-ink-faint)]">
                        {a.role} · {a.user}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-ink-faint)]">{formatDateTime(a.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Decision" />
          <div className="space-y-3 p-4">
            <textarea
              value={decisionComment}
              onChange={(e) => setDecisionComment(e.target.value)}
              rows={4}
              placeholder="Add an approval comment (optional for approve, required for send back / reject)..."
              className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
            />
            <Button variant="primary" className="w-full" onClick={handleApprove}>
              Approve
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setSendBackOpen(true)}>
              Send Back
            </Button>
            <Button variant="danger" className="w-full" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </div>
        </Card>
      </div>

      <SendBackModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        targets={SEND_BACK_TARGETS['Approval Pending'] ?? []}
        onConfirm={(target, c) => {
          sendBack(rfq.id, target, 'Approval Panel', name, c)
          pushToast(`${rfq.rfqNumber} sent back with comments.`, 'warning')
          navigate('/rfqs')
        }}
      />
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        rfq={rfq}
        onConfirm={(reason, c) => {
          rejectRFQ(rfq.id, 'Approval Panel', name, reason, c)
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

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className={clsx('mt-0.5', bold ? 'text-base font-bold' : 'text-sm font-semibold', 'text-[var(--color-ink)]')}>{value}</p>
    </div>
  )
}
