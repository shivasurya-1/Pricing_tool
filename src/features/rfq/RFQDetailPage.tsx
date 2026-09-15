import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MoreHorizontal, Pencil, ArrowRight } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { Badge } from '@/components/ui/Badge'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { getFieldLabel } from '@/data/pulleyTechDataSchema'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'
import { EmptyState } from '@/components/EmptyState'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format'
import { canRoleActOnStage, STAGE_ORDER } from '@/lib/workflow'
import { actionRouteForRfq } from '@/lib/routes'
import { summarizeCostBreakdown, marginStatus, marginStatusColor } from '@/lib/pricing'
import { PulleySourcingSummary } from '@/components/pulley/PulleySourcingSummary'
import clsx from 'clsx'

const TABS = ['Overview', 'Items', 'Technical', 'Sourcing', 'Pricing', 'Commercials', 'Approval', 'Activity', 'Attachments']

export function RFQDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const products = useDataStore((s) => s.products)
  const auditLog = useDataStore((s) => s.auditLog)
  const submitRFQ = useDataStore((s) => s.submitRFQ)
  const generateQuotation = useDataStore((s) => s.generateQuotation)
  const quotations = useDataStore((s) => s.quotations)
  const role = useAuthStore((s) => s.role)
  const userName = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)
  const [tab, setTab] = useState('Overview')

  const rfq = rfqs.find((r) => r.id === id)
  const rfqAudit = useMemo(() => auditLog.filter((a) => a.rfqId === id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [auditLog, id])
  const quotation = quotations.find((q) => q.rfqId === id)

  if (!rfq) {
    return <EmptyState title="RFQ not found" description="This RFQ may have been removed." action={<Button onClick={() => navigate('/rfqs')}>Back to RFQs</Button>} />
  }

  const canAct = canRoleActOnStage(role, rfq.stage)
  const summary = summarizeCostBreakdown(rfq.costBreakdown)

  const primaryAction = () => {
    if (rfq.stage === 'Draft') {
      submitRFQ(rfq.id, userName)
      pushToast(`${rfq.rfqNumber} submitted for Operations review.`, 'success')
      return
    }
    if (rfq.stage === 'Approved') {
      const quotation = generateQuotation(rfq.id, userName)
      pushToast('Quotation generated.', 'success')
      navigate(`/quotations/${quotation.id}`)
      return
    }
    navigate(actionRouteForRfq(rfq))
  }

  const primaryLabel = () => {
    switch (rfq.stage) {
      case 'Draft':
        return 'Submit RFQ'
      case 'Operations Review':
        return 'Review Now'
      case 'Sourcing':
        return 'Compare Vendors'
      case 'Controlling':
        return 'Calculate Pricing'
      case 'Approval Pending':
        return 'Review & Approve'
      case 'Approved':
        return 'Generate Quotation'
      case 'Quotation Generated':
      case 'Quotation Sent':
        return 'Go to Quotation'
      default:
        return 'Open'
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: rfq.rfqNumber }]}
        title={
          <span className="flex items-center gap-2">
            {rfq.rfqNumber}
            <StatusBadge stage={rfq.stage} />
          </span>
        }
        description={`${rfq.endCustomer} · ${rfq.projectName}`}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => pushToast('Editing an in-flight RFQ is not enabled in this prototype.', 'info')}>
              Edit
            </Button>
            {canAct && (
              <Button variant="primary" icon={<ArrowRight size={14} />} onClick={primaryAction}>
                {primaryLabel()}
              </Button>
            )}
            {rfq.stage === 'Quotation Sent' && quotation && (
              <Button variant="primary" onClick={() => navigate(`/quotations/${quotation.id}`)}>
                Track Customer Response
              </Button>
            )}
            <Button variant="ghost" icon={<MoreHorizontal size={16} />} onClick={() => pushToast('Duplicate / Withdraw are mock actions in this prototype.', 'info')} />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MiniStat label="Value" value={formatCurrency(rfq.value, rfq.currency)} />
        <MiniStat label="Priority" value={<PriorityBadge priority={rfq.priority} />} />
        <MiniStat label="Current Stage" value={rfq.stage} />
        <MiniStat label="Sales Owner" value={rfq.salesPerson} />
        <MiniStat label="Items" value={rfq.items.length} />
        <MiniStat label="Required Delivery" value={formatDate(rfq.requiredDeliveryDate)} />
      </div>

      <div className="mb-5">
        <WorkflowTimeline rfq={rfq} auditLog={auditLog} />
      </div>

      <Card>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="p-4">
          {tab === 'Overview' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <InfoBlock
                title="Customer Information"
                rows={[
                  ['Customer', rfq.endCustomer],
                  ['Customer Code', rfq.customerCode],
                  ['Contact Person', rfq.contactPerson],
                  ['Email', rfq.contactEmail],
                  ['Phone', rfq.contactPhone],
                  ['Customer Reference', rfq.customerReference],
                  ['RFQ Received Date', formatDate(rfq.rfqReceivedDate)],
                ]}
              />
              <InfoBlock
                title="Project Information"
                rows={[
                  ['Project Name', rfq.projectName],
                  ['Project Code', rfq.projectCode],
                  ['Quote Reference', rfq.quoteReference],
                  ['Location', rfq.location],
                  ['Industry', rfq.industry],
                  ['Required Delivery', formatDate(rfq.requiredDeliveryDate)],
                  ['Priority', rfq.priority],
                ]}
              />
              <InfoBlock
                title="Commercial Requirements"
                rows={[
                  ['Currency', rfq.currency],
                  ['Payment Terms', rfq.paymentTerms],
                  ['Delivery Terms', rfq.deliveryTerms],
                  ['Quotation Validity', rfq.quotationValidity],
                  ['Incoterms', rfq.incoterms],
                  ['Tax Applicability', rfq.taxApplicability],
                  ['Freight Requirement', rfq.freightRequirement],
                ]}
              />
              <InfoBlock title="Notes" rows={[['Internal Notes', rfq.internalNotes || '—'], ['Customer Notes', rfq.customerNotes || '—'], ['Customer Remarks', rfq.customerRemarks || '—']]} />
            </div>
          )}

          {tab === 'Items' && (
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2">Specification</th>
                  <th className="px-2 py-2 text-right">Target Price</th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-border)]">
                    <td className="px-2 py-2.5 text-[var(--color-ink-faint)]">{item.itemNo}</td>
                    <td className="px-2 py-2.5 font-medium">{item.productName}</td>
                    <td className="px-2 py-2.5 text-[var(--color-ink-soft)]">{item.description}</td>
                    <td className="px-2 py-2.5">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-2 py-2.5">{item.unit}</td>
                    <td className="px-2 py-2.5 text-[var(--color-ink-soft)]">{item.specification}</td>
                    <td className="px-2 py-2.5 text-right">{formatCurrency(item.targetPrice, rfq.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'Technical' && (
            <div className="space-y-5">
              {rfq.items.map((item) => {
                const product = products.find((p) => p.id === item.productId)
                const captured = isTechDataFilled(item.technicalData)
                const entries = captured
                  ? Object.entries(item.technicalData ?? {})
                      .filter(([, v]) => v !== undefined && v !== '')
                      .map(([k, v]) => [getFieldLabel(k), v] as const)
                  : Object.entries(product?.technicalData ?? {})
                if (entries.length === 0) return null
                return (
                  <div key={item.id}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                      {item.productName}
                      {captured ? (
                        <Badge tone="green">From Customer Tech Data Sheet</Badge>
                      ) : (
                        <Badge tone="neutral">Product Master defaults</Badge>
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                      {entries.map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-dashed border-[var(--color-border)] py-1">
                          <span className="text-[var(--color-ink-faint)]">{k}</span>
                          <span className="font-medium text-[var(--color-ink)]">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'Sourcing' && (
            <div>
              {STAGE_ORDER.indexOf(rfq.stage) < STAGE_ORDER.indexOf('Sourcing') ? (
                <EmptyState title="Sourcing not started" description="This RFQ hasn't reached the Sourcing stage yet." />
              ) : (
                <div className="space-y-5">
                  {rfq.sourcingComments && <p className="text-sm text-[var(--color-ink-soft)]">{rfq.sourcingComments}</p>}
                  {rfq.items.map((item) => (
                    <PulleySourcingSummary key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'Pricing' && (
            <div>
              {rfq.costBreakdown.length === 0 ? (
                <EmptyState title="Pricing not calculated" description="This RFQ hasn't reached Controlling yet." />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Total Cost" value={formatCurrency(summary.totalCost)} />
                    <MiniStat label="Selling Price" value={formatCurrency(summary.totalSellingPrice)} />
                    <MiniStat
                      label="Margin %"
                      value={
                        <span className={clsx('rounded border px-1.5 py-0.5 font-semibold', marginStatusColor[marginStatus(summary.marginPercent, rfq.targetMarginPercent)])}>
                          {summary.marginPercent.toFixed(1)}%
                        </span>
                      }
                    />
                    <MiniStat label="Grand Total" value={formatCurrency(summary.grandTotal)} />
                  </div>
                  <table className="w-full min-w-[800px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
                        <th className="px-2 py-1.5">Item</th>
                        <th className="px-2 py-1.5 text-right">Base Cost</th>
                        <th className="px-2 py-1.5 text-right">Adjusted Cost</th>
                        <th className="px-2 py-1.5 text-right">Margin %</th>
                        <th className="px-2 py-1.5 text-right">Selling Price</th>
                        <th className="px-2 py-1.5 text-right">Final Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfq.costBreakdown.map((line) => {
                        const item = rfq.items.find((i) => i.id === line.itemId)
                        return (
                          <tr key={line.itemId} className="border-b border-[var(--color-border)]">
                            <td className="px-2 py-1.5 font-medium">{item?.productName}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(line.baseCost)}</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(line.adjustedCost)}</td>
                            <td className="px-2 py-1.5 text-right">{line.marginPercent.toFixed(1)}%</td>
                            <td className="px-2 py-1.5 text-right">{formatCurrency(line.sellingPrice)}</td>
                            <td className="px-2 py-1.5 text-right font-semibold">{formatCurrency(line.finalPrice)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'Commercials' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Freight" value={formatCurrency(summary.totalFreight)} />
              <MiniStat label="Discount" value={formatCurrency(summary.totalDiscount)} />
              <MiniStat label="Tax" value={formatCurrency(summary.totalTax)} />
              <MiniStat label="Grand Total" value={formatCurrency(summary.grandTotal)} />
              <MiniStat label="Payment Terms" value={rfq.paymentTerms} />
              <MiniStat label="Delivery Terms" value={rfq.deliveryTerms} />
              <MiniStat label="Incoterms" value={rfq.incoterms} />
              <MiniStat label="Validity" value={rfq.quotationValidity} />
            </div>
          )}

          {tab === 'Approval' && (
            <div className="space-y-3">
              {rfqAudit.filter((a) => a.newStatus).length === 0 ? (
                <EmptyState title="No approval activity yet" />
              ) : (
                rfqAudit
                  .filter((a) => a.newStatus)
                  .map((a) => (
                    <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3 text-sm">
                      <div>
                        <p className="font-medium text-[var(--color-ink)]">{a.action}</p>
                        <p className="text-xs text-[var(--color-ink-faint)]">
                          {a.role} · {a.user}
                        </p>
                        {a.comment && <p className="mt-1 rounded bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-ink-soft)]">"{a.comment}"</p>}
                      </div>
                      <span className="shrink-0 text-xs text-[var(--color-ink-faint)]">{formatDateTime(a.timestamp)}</span>
                    </div>
                  ))
              )}
            </div>
          )}

          {tab === 'Activity' && (
            <div className="space-y-3">
              {rfqAudit.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{a.action}</p>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      {a.role} · {a.user} {a.previousStatus && a.newStatus && `· ${a.previousStatus} → ${a.newStatus}`}
                    </p>
                    {a.comment && <p className="mt-1 rounded bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-ink-soft)]">"{a.comment}"</p>}
                  </div>
                  <span className="shrink-0 text-xs text-[var(--color-ink-faint)]">{formatDateTime(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'Attachments' && (
            <div>
              {rfq.attachments.length === 0 ? (
                <EmptyState title="No attachments" description="No files were uploaded with this RFQ." />
              ) : (
                <div className="space-y-2">
                  {rfq.attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                      {a.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  )
}

function InfoBlock({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      <div className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-dashed border-[var(--color-border)] py-1">
            <span className="text-[var(--color-ink-faint)]">{label}</span>
            <span className="text-right font-medium text-[var(--color-ink)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
