import type { ReactNode } from 'react'
import clsx from 'clsx'

export type Tone = 'neutral' | 'teal' | 'purple' | 'orange' | 'blue' | 'green' | 'red' | 'amber'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  teal: 'bg-[var(--color-teal-50)] text-[var(--color-teal)] border-[var(--color-teal-100)]',
  purple: 'bg-[var(--color-purple-50)] text-[var(--color-purple)] border-[var(--color-purple-100)]',
  orange: 'bg-[var(--color-orange-50)] text-[var(--color-orange)] border-[var(--color-orange-100)]',
  blue: 'bg-[var(--color-blue-50)] text-[var(--color-blue)] border-[var(--color-blue-100)]',
  green: 'bg-[var(--color-green-50)] text-[var(--color-green)] border-[var(--color-green-100)]',
  red: 'bg-[var(--color-red-50)] text-[var(--color-red)] border-[var(--color-red-100)]',
  amber: 'bg-[var(--color-amber-50)] text-[var(--color-amber)] border-[var(--color-amber-100)]',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
