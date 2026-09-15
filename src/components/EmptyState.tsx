import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-ink-faint)]">
        {icon ?? <Inbox size={20} />}
      </div>
      <p className="text-sm font-semibold text-[var(--color-ink)]">{title}</p>
      {description && <p className="max-w-sm text-xs text-[var(--color-ink-faint)]">{description}</p>}
      {action && <div className="mt-3 flex gap-2">{action}</div>}
    </div>
  )
}
