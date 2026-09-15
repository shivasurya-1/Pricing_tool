import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useUiStore } from '@/store/uiStore'

const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info }
const TONE = {
  success: 'border-[var(--color-green-100)] bg-[var(--color-green-50)] text-[var(--color-green)]',
  warning: 'border-[var(--color-amber-100)] bg-[var(--color-amber-50)] text-[var(--color-amber)]',
  error: 'border-[var(--color-red-100)] bg-[var(--color-red-50)] text-[var(--color-red)]',
  info: 'border-[var(--color-blue-100)] bg-[var(--color-blue-50)] text-[var(--color-blue)]',
}

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts)
  const dismissToast = useUiStore((s) => s.dismissToast)

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={t.id}
            className={clsx('pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2.5 shadow-md', TONE[t.kind])}
          >
            <Icon size={16} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm text-[var(--color-ink)]">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="text-[var(--color-ink-faint)]">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
