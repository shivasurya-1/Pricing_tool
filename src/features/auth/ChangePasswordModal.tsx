import { useState } from 'react'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/apiClient'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'

/** "Change password" for a signed-in user: current password, then the new one twice. */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mounted only while open, so every opening starts with an empty form.
  if (!open) return null
  return <Form onClose={onClose} />
}

function Form({ onClose }: { onClose: () => void }) {
  const setAccess = useAuthStore((s) => s.setAccess)
  const pushToast = useUiStore((s) => s.pushToast)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const rules = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: next !== '' && !/^\d+$/.test(next), text: 'Not only numbers' },
    { ok: next !== '' && next !== current, text: 'Different from your current password' },
    { ok: next !== '' && next === confirm, text: 'Both new entries match' },
  ]
  const canSave = !!current && rules.every((r) => r.ok) && !saving

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    setErrors([])
    setSaving(true)
    try {
      // New access token in the body, new refresh token as the httpOnly cookie: this browser stays in.
      const res = await api.post<{ access: string }>('/auth/change-password/', { current_password: current, new_password: next })
      setAccess(res.access)
      pushToast('Password changed. Other devices have been signed out.', 'success')
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(err.errors)
      else setErrors([err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.'])
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'
  return (
    <Modal
      open
      onClose={onClose}
      title="Change password"
      width="max-w-sm"
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="change-password-form" disabled={!canSave}>
            {saving ? 'Saving...' : 'Change password'}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSave} className="space-y-3">
        <div>
          <label htmlFor="cp-current" className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Current password
          </label>
          <input id="cp-current" type={show ? 'text' : 'password'} autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="cp-new" className="block text-xs font-medium text-[var(--color-ink-soft)]">
              New password
            </label>
            <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]">
              {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <input id="cp-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="cp-confirm" className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Confirm new password
          </label>
          <input id="cp-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
        </div>

        <ul className="space-y-1 text-xs" aria-label="Password requirements">
          {rules.map((r) => (
            <li key={r.text} className={`flex items-center gap-1.5 ${r.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-ink-faint)]'}`}>
              {r.ok ? <Check size={13} /> : <Circle size={13} />}
              {r.text}
            </li>
          ))}
        </ul>

        {errors.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 rounded-md bg-[var(--color-red-50)] py-2 pl-7 pr-3 text-xs text-[var(--color-red)]">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </form>
    </Modal>
  )
}
