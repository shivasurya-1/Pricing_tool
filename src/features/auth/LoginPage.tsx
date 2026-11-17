import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Wrench, Truck, Calculator, ShieldCheck, Settings2, Eye, EyeOff, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { AuthLayout } from '@/features/auth/AuthLayout'
import type { Role } from '@/types'

const ROLE_CARDS: { role: Role; icon: typeof FileText; blurb: string }[] = [
  { role: 'Sales', icon: FileText, blurb: 'Create RFQs, track progress, send quotations' },
  { role: 'Operations', icon: Wrench, blurb: 'Review feasibility and delivery' },
  { role: 'Sourcing', icon: Truck, blurb: 'Compare vendors, select best source' },
  { role: 'Controlling', icon: Calculator, blurb: 'Calculate margin and final price' },
  { role: 'Approval Panel', icon: ShieldCheck, blurb: 'Final review and sign-off' },
  { role: 'Admin', icon: Settings2, blurb: 'Masters, users and system settings' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const usernameInput = useRef<HTMLInputElement>(null)
  // The role card picked: sign-in is then checked against this role on the server.
  const [pickedRole, setPickedRole] = useState<Role | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(username, password, pickedRole ?? undefined)
    setSubmitting(false)
    if (result.ok) {
      navigate('/dashboard')
    } else {
      setError(result.error)
    }
  }

  // A card only picks the role; nothing is signed in until a username and password are sent.
  const pickRole = (role: Role) => {
    setPickedRole(role)
    setError('')
    usernameInput.current?.focus()
  }

  return (
    <AuthLayout>
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
            {pickedRole ? `Enter the username and password of your ${pickedRole} account.` : 'Enter your username and password, or pick a role below.'}
          </p>
          {pickedRole && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-sm text-[var(--color-blue)]">
              <span>
                Signing in as <b>{pickedRole}</b>
              </span>
              <button type="button" onClick={() => setPickedRole(null)} aria-label="Clear the picked role" className="rounded p-0.5 hover:bg-white/70">
                <X size={14} />
              </button>
            </div>
          )}

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Username</label>
              <input
                ref={usernameInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.username"
                autoComplete="username"
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-[var(--color-ink-soft)]">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-[var(--color-blue)] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 pr-9 text-sm outline-none focus:border-[var(--color-blue)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink-soft)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
            <Button variant="primary" type="submit" className="w-full" disabled={submitting || !username || !password}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs font-medium text-[var(--color-ink-faint)]">Or pick your role</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {ROLE_CARDS.map(({ role, icon: Icon, blurb }) => (
              <button
                key={role}
                type="button"
                aria-pressed={pickedRole === role}
                onClick={() => pickRole(role)}
                className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)] ${
                  pickedRole === role ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)]' : 'border-[var(--color-border)] bg-white'
                }`}
              >
                <Icon size={16} className="text-[var(--color-blue)]" />
                <span className="text-sm font-medium text-[var(--color-ink)]">{role}</span>
                <span className="text-[11px] leading-snug text-[var(--color-ink-faint)]">{blurb}</span>
              </button>
            ))}
          </div>
    </AuthLayout>
  )
}
