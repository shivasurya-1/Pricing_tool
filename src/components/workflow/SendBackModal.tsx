import { useState } from 'react'
import type { Stage } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SEND_BACK_LABELS } from '@/lib/workflow'

export function SendBackModal({
  open,
  onClose,
  targets,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  targets: Stage[]
  onConfirm: (target: Stage, comment: string) => void
}) {
  const [target, setTarget] = useState<Stage | ''>('')
  const [comment, setComment] = useState('')

  const canConfirm = target !== '' && comment.trim().length > 0

  const handleClose = () => {
    setTarget('')
    setComment('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send RFQ back to which stage?"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canConfirm}
            onClick={() => {
              if (target === '' || !comment.trim()) return
              onConfirm(target, comment.trim())
              handleClose()
            }}
          >
            Send Back
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">Target stage</label>
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <button
                key={t}
                onClick={() => setTarget(t)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  target === t
                    ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]'
                    : 'border-[var(--color-border)] bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]'
                }`}
              >
                {SEND_BACK_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--color-ink-soft)]">
            Comment <span className="text-[var(--color-red)]">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Explain why this RFQ is being sent back..."
            className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
          />
        </div>
      </div>
    </Modal>
  )
}
