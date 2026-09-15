import { useState } from 'react'
import type { RFQ } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { REJECTION_REASONS } from '@/lib/workflow'
import { formatCurrency } from '@/lib/format'

export function RejectModal({
  open,
  onClose,
  rfq,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  rfq: RFQ | undefined
  onConfirm: (reason: string, comment: string) => void
}) {
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const canConfirm = reason !== '' && comment.trim().length > 0

  const handleClose = () => {
    setReason('')
    setComment('')
    onClose()
  }

  if (!rfq) return null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Reject RFQ"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return
              onConfirm(reason, comment.trim())
              handleClose()
            }}
          >
            Reject RFQ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-md bg-[var(--color-surface)] p-3 text-xs">
          <div>
            <p className="text-[var(--color-ink-faint)]">RFQ</p>
            <p className="font-medium text-[var(--color-ink)]">{rfq.rfqNumber}</p>
          </div>
          <div>
            <p className="text-[var(--color-ink-faint)]">Customer</p>
            <p className="font-medium text-[var(--color-ink)]">{rfq.endCustomer}</p>
          </div>
          <div>
            <p className="text-[var(--color-ink-faint)]">Quote value</p>
            <p className="font-medium text-[var(--color-ink)]">{formatCurrency(rfq.value, rfq.currency)}</p>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">
            Rejection reason <span className="text-[var(--color-red)]">*</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
          >
            <option value="">Select a reason...</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">
            Comment <span className="text-[var(--color-red)]">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Please enter a rejection comment..."
            className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
          />
        </div>
      </div>
    </Modal>
  )
}
