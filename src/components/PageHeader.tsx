import type { ReactNode } from 'react'
import { Breadcrumbs, type Crumb } from '@/components/Breadcrumbs'

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        {crumbs && <Breadcrumbs items={crumbs} />}
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-[var(--color-ink-faint)]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
