import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Printer, Mail, Download, Send, Eye, FileText } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { QuotationPreview } from '@/features/quotations/QuotationPreview'
import { formatCurrency, formatDate } from '@/lib/format'
import { LOSS_REASONS } from '@/lib/workflow'
import { downloadFile, ApiError } from '@/lib/apiClient'
import type { QuotationStatus } from '@/types'

const RESPONSE_OPTIONS: QuotationStatus[] = ['Sent', 'Viewed', 'Negotiation', 'Won', 'Lost']

export function QuotationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const quotations = useDataStore((s) => s.quotations)
  const rfqs = useDataStore((s) => s.rfqs)
  const sendQuotation = useDataStore((s) => s.sendQuotation)
  const updateQuotationStatus = useDataStore((s) => s.updateQuotationStatus)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const [showPreview, setShowPreview] = useState(false)
  const [lossModalOpen, setLossModalOpen] = useState(false)
  const [lossReason, setLossReason] = useState('')
  const [downloading, setDownloading] = useState(false)

  const quotation = quotations.find((q) => q.id === id)
  const rfq = rfqs.find((r) => r.id === quotation?.rfqId)

  if (!quotation || !rfq) return <EmptyState title="Quotation not found" action={<Button onClick={() => navigate('/quotations')}>Back to Quotations</Button>} />

  const handleStatusChange = (status: QuotationStatus) => {
    if (status === 'Lost') {
      setLossModalOpen(true)
      return
    }
    updateQuotationStatus(quotation.id, status, name)
    pushToast(`Customer response updated to ${status}.`, 'success')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Quotations', to: '/quotations' }, { label: quotation.quotationNumber }]}
        title={quotation.quotationNumber}
        description={`${quotation.customerName} · ${quotation.projectName}`}
        actions={
          <>
            <Button variant="secondary" icon={<Eye size={14} />} onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide Preview' : 'Preview'}
            </Button>
            <Button variant="secondary" icon={<Printer size={14} />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" icon={<Mail size={14} />} onClick={() => pushToast('Quotation emailed to customer (mock).', 'success')}>
              Send Email
            </Button>
            <Button
              variant="secondary"
              icon={<Download size={14} />}
              disabled={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadFile(`/rfq/quotations/${quotation.id}/pdf/`, `${quotation.quotationNumber}.pdf`)
                } catch (err) {
                  pushToast(err instanceof ApiError ? err.message : 'Failed to download PDF.', 'error')
                } finally {
                  setDownloading(false)
                }
              }}
            >
              {downloading ? 'Downloading...' : 'Download PDF'}
            </Button>
            {quotation.status === 'Draft' && (
              <Button
                variant="primary"
                icon={<Send size={14} />}
                onClick={() => {
                  sendQuotation(rfq.id, name)
                  pushToast('Quotation marked as sent.', 'success')
                }}
              >
                Mark as Sent
              </Button>
            )}
          </>
        }
      />

      {showPreview ? (
        <QuotationPreview rfq={rfq} quotation={quotation} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title="Quotation Summary" />
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
                <Stat label="Quotation Date" value={formatDate(quotation.quoteDate)} />
                <Stat label="Valid Until" value={formatDate(quotation.validUntil)} />
                <Stat label="Amount" value={formatCurrency(quotation.amount, quotation.currency)} />
                <Stat label="Margin" value={`${quotation.marginPercent.toFixed(1)}%`} />
                <Stat label="Sales Person" value={quotation.salesPerson} />
                <Stat label="RFQ" value={quotation.rfqNumber} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Related RFQ" description="Full detail, items, sourcing and pricing" />
              <div className="p-4">
                <Button variant="secondary" icon={<FileText size={14} />} onClick={() => navigate(`/rfqs/${rfq.id}`)}>
                  Open {rfq.rfqNumber}
                </Button>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Customer Response" />
            <div className="space-y-3 p-4">
              <p className="text-xs text-[var(--color-ink-faint)]">Current status</p>
              <Badge tone={quotation.status === 'Won' ? 'green' : quotation.status === 'Lost' ? 'red' : 'blue'}>{quotation.status}</Badge>
              {quotation.lossReason && <p className="text-xs text-[var(--color-ink-soft)]">Loss reason: {quotation.lossReason}</p>}

              <div className="pt-2">
                <p className="mb-1.5 text-xs font-medium text-[var(--color-ink-soft)]">Update status</p>
                <div className="flex flex-wrap gap-1.5">
                  {RESPONSE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleStatusChange(opt)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        quotation.status === opt ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]' : 'border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={lossModalOpen}
        onClose={() => setLossModalOpen(false)}
        title="Mark Quotation as Lost"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLossModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!lossReason}
              onClick={() => {
                updateQuotationStatus(quotation.id, 'Lost', name, lossReason)
                pushToast('Quotation marked as Lost.', 'warning')
                setLossModalOpen(false)
                setLossReason('')
              }}
            >
              Confirm Lost
            </Button>
          </>
        }
      >
        <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">
          Loss reason <span className="text-[var(--color-red)]">*</span>
        </label>
        <select value={lossReason} onChange={(e) => setLossReason(e.target.value)} className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]">
          <option value="">Select a reason...</option>
          {LOSS_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Modal>
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
