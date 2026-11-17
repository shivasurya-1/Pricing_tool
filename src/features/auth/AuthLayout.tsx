import type { ReactNode } from 'react'
import { Boxes, ArrowRight } from 'lucide-react'

/** The split sign-in screen shared by Login, Forgot password and Reset password: brand panel on the left, the form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
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
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
