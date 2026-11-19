import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Check, Circle, TriangleAlert } from 'lucide-react'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/apiClient'

type Phase = 'checking' | 'invalid' | 'form' | 'done'

/**
 * Step 2 of resetting a password: the page the emailed link opens
 * (/reset-password?uid=...&token=...). It checks the link first, so an expired one is
 * explained before anyone types a password, then sets the new password.
 *
 * With `welcome`, the same page is the new-user "choose your password" page that the welcome
 * email links to (/set-password?uid=...&token=...): same backend endpoints, welcome wording.
 */
export function ResetPasswordPage({ welcome = false }: { welcome?: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''

  const [phase, setPhase] = useState<Phase>(uid && token ? 'checking' : 'invalid')
  const [invalidMessage, setInvalidMessage] = useState('This reset link is incomplete. Open the link from your email again, or request a new one.')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!uid || !token) return
    let live = true
    api
      .post('/auth/reset-password/check/', { uid, token })
      .then(() => live && setPhase('form'))
      .catch((err) => {
        if (!live) return
        setInvalidMessage(err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.')
        setPhase('invalid')
      })
    return () => {
      live = false
    }
  }, [uid, token])

  const rules = [
    { ok: password.length >= 8, text: 'At least 8 characters' },
    { ok: password !== '' && !/^\d+$/.test(password), text: "Not only numbers" },
    { ok: password !== '' && password === confirm, text: 'Both entries match' },
  ]
  const canSubmit = rules.every((r) => r.ok) && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setErrors([])
    setSubmitting(true)
    try {
      await api.post('/auth/reset-password/', { uid, token, password })
      setPhase('done')
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) {
        setErrors(err.errors) // the password was refused: say why, the link is still good
      } else if (err instanceof ApiError && err.status === 429) {
        setErrors(['Too many attempts. Please wait a while and try again.'])
      } else if (err instanceof ApiError && err.status === 400) {
        setInvalidMessage(err.message)
        setPhase('invalid')
      } else {
        setErrors(['Could not reach the server. Please try again.'])
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'checking') {
    return (
      <AuthLayout>
        <p className="text-sm text-[var(--color-ink-soft)]">{welcome ? 'Checking your link...' : 'Checking your reset link...'}</p>
      </AuthLayout>
    )
  }

  if (phase === 'invalid') {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-amber-50)] text-[var(--color-amber)]">
          <TriangleAlert size={22} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">This link can't be used</h2>
        <p role="alert" className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {invalidMessage}
        </p>
        {welcome && (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Enter your email on the next page to get a new link to choose your password.</p>
        )}
        <div className="mt-6 space-y-2">
          <Link to="/forgot-password">
            <Button variant="primary" className="w-full">
              Request a new link
            </Button>
          </Link>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue)] hover:underline">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (phase === 'done') {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-green-50)] text-[var(--color-green)]">
          <CheckCircle2 size={22} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">{welcome ? 'Password set' : 'Password changed'}</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {welcome
            ? 'Your password is set. Sign in with your username and the password you just chose.'
            : "Your password has been updated. For your security you've been signed out everywhere, so sign in again with the new password."}
        </p>
        <Button variant="primary" className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
          Go to sign in
        </Button>
      </AuthLayout>
    )
  }

  const field = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 pr-9 text-sm outline-none focus:border-[var(--color-blue)]'
  return (
    <AuthLayout>
      <h2 className="text-xl font-semibold text-[var(--color-ink)]">{welcome ? 'Welcome - choose your password' : 'Choose a new password'}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-faint)]">Pick a password you don't use anywhere else.</p>

      <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            New password
          </label>
          <div className="relative">
            <input id="new-password" type={show ? 'text' : 'password'} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide passwords' : 'Show passwords'}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Confirm new password
          </label>
          <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
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

        <Button variant="primary" type="submit" className="w-full" disabled={!canSubmit}>
          {submitting ? 'Saving...' : welcome ? 'Set password' : 'Change password'}
        </Button>
      </form>

      <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue)] hover:underline">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </AuthLayout>
  )
}
