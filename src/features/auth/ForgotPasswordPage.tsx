import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { Button } from '@/components/ui/Button'
import { api, ApiError } from '@/lib/apiClient'

/** "60" -> "1 hour", "90" -> "90 minutes": how long the emailed link works, as the server set it. */
function describeMinutes(minutes: number | null): string {
  if (!minutes || minutes < 1) return 'after a short time'
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `in ${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `in ${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** Step 1 of resetting a password: ask for the account's email; the backend emails a one-time link. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [validMinutes, setValidMinutes] = useState<number | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    setError('')
    setSubmitting(true)
    try {
      const res = await api.post<{ valid_minutes?: number }>('/auth/forgot-password/', { email: address })
      setValidMinutes(typeof res?.valid_minutes === 'number' ? res.valid_minutes : null)
      setSentTo(address)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError('Too many requests. Please wait a while and try again.')
      else setError(err instanceof ApiError ? err.message : 'Could not reach the server. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-green-50)] text-[var(--color-green)]">
          <MailCheck size={22} />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">Check your email</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          If an account uses <b>{sentTo}</b>, we've sent a link to choose a new password. It works once and expires {describeMinutes(validMinutes)}.
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">Nothing in your inbox? Check spam, or make sure you typed the address your administrator registered.</p>
        <div className="mt-6 space-y-2">
          <Link to="/login">
            <Button variant="primary" className="w-full">
              Back to sign in
            </Button>
          </Link>
          <Button variant="secondary" className="w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h2 className="text-xl font-semibold text-[var(--color-ink)]">Forgot your password?</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-faint)]">Enter the email address of your account and we'll send you a link to choose a new one.</p>

      <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="forgot-email" className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Email address
          </label>
          <input
            id="forgot-email"
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
          />
        </div>
        {error && (
          <p role="alert" className="text-xs text-[var(--color-red)]">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" className="w-full" disabled={submitting || !email.includes('@')}>
          {submitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue)] hover:underline">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </AuthLayout>
  )
}
