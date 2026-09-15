import type { Quotation, RFQ } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { summarizeCostBreakdown } from '@/lib/pricing'

export function QuotationPreview({ rfq, quotation }: { rfq: RFQ; quotation: Quotation }) {
  const summary = summarizeCostBreakdown(rfq.costBreakdown)

  return (
    <div id="print-area" className="mx-auto max-w-3xl bg-white p-10 text-sm text-[var(--color-ink)] shadow-sm">
      <div className="mb-8 flex items-start justify-between border-b-2 border-[var(--color-navy)] pb-6">
        <div>
          <p className="text-lg font-bold text-[var(--color-navy)]">Apex Industrial Group</p>
          <p className="text-xs text-[var(--color-ink-faint)]">Industrial Pulleys & Conveyor Components</p>
          <p className="text-xs text-[var(--color-ink-faint)]">Plot 14, Industrial Estate, India · GSTIN: 27AACCX0000A1Z1</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-[var(--color-navy)]">QUOTATION</p>
          <p className="text-xs text-[var(--color-ink-faint)]">{quotation.quotationNumber}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Customer</p>
          <p className="font-medium">{rfq.endCustomer}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">{rfq.contactPerson}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">{rfq.contactEmail}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">{rfq.location}</p>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Details</p>
          <p>
            <span className="text-[var(--color-ink-faint)]">Quotation Date:</span> {formatDate(quotation.quoteDate)}
          </p>
          <p>
            <span className="text-[var(--color-ink-faint)]">Valid Until:</span> {formatDate(quotation.validUntil)}
          </p>
          <p>
            <span className="text-[var(--color-ink-faint)]">Project:</span> {rfq.projectName}
          </p>
          <p>
            <span className="text-[var(--color-ink-faint)]">RFQ Ref:</span> {rfq.rfqNumber}
          </p>
        </div>
      </div>

      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-[var(--color-navy)] text-left uppercase text-[var(--color-ink-faint)]">
            <th className="py-2">#</th>
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit Price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rfq.items.map((item) => {
            const line = rfq.costBreakdown.find((l) => l.itemId === item.id)
            const unitPrice = line ? line.finalPrice / item.quantity : item.targetPrice
            return (
              <tr key={item.id} className="border-b border-[var(--color-border)]">
                <td className="py-2">{item.itemNo}</td>
                <td className="py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-[var(--color-ink-faint)]">{item.description}</p>
                </td>
                <td className="py-2 text-right">
                  {item.quantity} {item.unit}
                </td>
                <td className="py-2 text-right">{formatCurrency(unitPrice, rfq.currency)}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(line?.finalPrice ?? unitPrice * item.quantity, rfq.currency)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mb-6 flex justify-end">
        <div className="w-64 space-y-1 text-xs">
          <Row label="Subtotal" value={formatCurrency(summary.totalCost + summary.grossMargin, rfq.currency)} />
          <Row label="Discount" value={`- ${formatCurrency(summary.totalDiscount, rfq.currency)}`} />
          <Row label="Freight" value={formatCurrency(summary.totalFreight, rfq.currency)} />
          <Row label="Tax" value={formatCurrency(summary.totalTax, rfq.currency)} />
          <div className="mt-1 flex justify-between border-t-2 border-[var(--color-navy)] pt-1.5 text-sm font-bold">
            <span>Grand Total</span>
            <span>{formatCurrency(summary.grandTotal, rfq.currency)}</span>
          </div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4 border-t border-[var(--color-border)] pt-4 text-xs">
        <div>
          <p className="font-semibold text-[var(--color-ink-faint)]">Delivery Terms</p>
          <p>{rfq.deliveryTerms}</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--color-ink-faint)]">Payment Terms</p>
          <p>{rfq.paymentTerms}</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--color-ink-faint)]">Validity</p>
          <p>{rfq.quotationValidity}</p>
        </div>
      </div>

      {rfq.customerNotes && (
        <div className="mb-6 text-xs">
          <p className="mb-1 font-semibold text-[var(--color-ink-faint)]">Notes</p>
          <p className="text-[var(--color-ink-soft)]">{rfq.customerNotes}</p>
        </div>
      )}

      <div className="mb-8 text-xs text-[var(--color-ink-faint)]">
        <p className="mb-1 font-semibold">Terms & Conditions</p>
        <p>1. Prices are in {rfq.currency} and exclude any charges not explicitly listed above.</p>
        <p>2. Delivery timelines are indicative and subject to order confirmation.</p>
        <p>3. This quotation is valid until {formatDate(quotation.validUntil)}.</p>
      </div>

      <div className="flex justify-between pt-8 text-xs">
        <div>
          <div className="mb-1 h-10 w-40 border-b border-[var(--color-ink-faint)]" />
          <p className="text-[var(--color-ink-faint)]">Customer Signature</p>
        </div>
        <div>
          <div className="mb-1 h-10 w-40 border-b border-[var(--color-ink-faint)]" />
          <p className="text-[var(--color-ink-faint)]">Authorized Signatory — Apex Industrial Group</p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--color-ink-faint)]">{label}</span>
      <span>{value}</span>
    </div>
  )
}
