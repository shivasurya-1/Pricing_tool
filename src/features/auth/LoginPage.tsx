import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, ArrowRight, FileText, Wrench, Truck, Calculator, ShieldCheck, Settings2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
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
  const loginAs = useAuthStore((s) => s.loginAs)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(username, password)
    setSubmitting(false)
    if (result.ok) {
      navigate('/dashboard')
    } else {
      setError(result.error)
    }
  }

  const enterAsDemo = (role: Role) => {
    loginAs(role)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen w-full bg-[var(--color-surface)]">
      <div className="hidden w-1/2 flex-col justify-between bg-[var(--color-navy)] p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <Boxes size={24} className="text-[var(--color-blue)]" />
          <span className="text-lg font-semibold">Apex ERP · RFQ Suite</span>
        </div>

        <div>
          <h1 className="mb-3 text-3xl font-semibold leading-tight">RFQ → Quotation, end to end.</h1>
          <p className="max-w-md text-sm text-white/70">
            A single workflow for the full quote lifecycle — from customer RFQ through operations review, vendor
            sourcing, commercial pricing, final approval, and a professional customer-ready quotation.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs">
            {['Sales', 'Operations', 'Sourcing', 'Controlling', 'Approval', 'Quotation'].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 font-medium">{s}</span>
                {i < arr.length - 1 && <ArrowRight size={13} className="text-white/40" />}
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">Apex ERP · RFQ Suite</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-faint)]">Enter your username and password.</p>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.username"
                autoComplete="username"
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]"
              />
            </div>
            {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
            <Button variant="primary" type="submit" className="w-full" disabled={submitting || !username || !password}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-xs font-medium text-[var(--color-ink-faint)]">Demo Role Login (dev only)</span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {ROLE_CARDS.map(({ role, icon: Icon, blurb }) => (
                  <button
                    key={role}
                    onClick={() => enterAsDemo(role)}
                    className="flex flex-col items-start gap-1.5 rounded-lg border border-[var(--color-border)] bg-white p-3 text-left transition-colors hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)]"
                  >
                    <Icon size={16} className="text-[var(--color-blue)]" />
                    <span className="text-sm font-medium text-[var(--color-ink)]">{role}</span>
                    <span className="text-[11px] leading-snug text-[var(--color-ink-faint)]">{blurb}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
