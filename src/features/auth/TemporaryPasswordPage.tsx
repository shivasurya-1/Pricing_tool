import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/apiClient'

/**
 * "Reset your password" for a new user: the page the welcome email's Reset password button
 * opens (/reset-temporary-password?username=...), and where the login page sends someone who
 * tries to sign in with the temporary password. They enter their username, the temporary
 * (current) password and a new password twice; POST /auth/initial-password/ replaces it.
 * Needs no sign-in: the username and current password prove who it is.
 */
export function TemporaryPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromLogin = (useLocation().state as { fromLogin?: boolean } | null)?.fromLogin === true

  const [username, setUsername] = useState(params.get('username') ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const rules = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: next !== '' && !/^\d+$/.test(next), text: 'Not only numbers' },
    { ok: next !== '' && next !== current, text: 'Different from your current password' },
    { ok: next !== '' && next === confirm, text: 'Both new entries match' },
  ]
  const canSubmit = !!username.trim() && !!current && rules.every((r) => r.ok) && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setErrors([])
    setSubmitting(true)
    try {
      await api.post('/auth/initial-password/', { username: username.trim(), current_password: current, new_password: next })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.errors.length) setErrors(err.errors)
      else if (err instanceof ApiError && err.status === 429) setErrors(['Too many attempts. Please wait a while and try again.'])
      else setErrors([err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-green-50)] text-[var(--color-green)]">
          <CheckCircle2 size={22} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">Password changed</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">Your new password is set. Sign in with your username and your new password.</p>
        <Button variant="primary" className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
          Go to sign in
        </Button>
      </AuthLayout>
    )
  }

  const field = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'
  const label = 'mb-1 block text-xs font-medium text-[var(--color-ink-soft)]'
  return (
    <AuthLayout>
      <h2 className="text-xl font-semibold text-[var(--color-ink)]">Reset your password</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
        {fromLogin
          ? 'You signed in with the temporary password from your welcome email. Choose your own password to continue.'
          : 'Enter the temporary password from your welcome email, then choose your own password.'}
      </p>

      <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="tp-username" className={label}>
            Username
          </label>
          <input id="tp-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="tp-current" className={label}>
            Current password
          </label>
          <input
            id="tp-current"
            type={show ? 'text' : 'password'}
            autoFocus={!!username}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={field}
            placeholder="The temporary password from your email"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="tp-new" className="block text-xs font-medium text-[var(--color-ink-soft)]">
              New password
            </label>
            <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-1 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]">
              {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide' : 'Show'}
            </button>
          </div>
          <input id="tp-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="tp-confirm" className={label}>
            Re-enter new password
          </label>
          <input id="tp-confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
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
          {submitting ? 'Saving...' : 'Reset password'}
        </Button>
      </form>

      <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue)] hover:underline">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </AuthLayout>
  )
}
