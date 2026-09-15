import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  'data-tour'?: string
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx('rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3', className)}>
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}
