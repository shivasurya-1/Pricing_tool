import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'

interface KpiCardProps {
  label: string
  value: ReactNode
  change?: number
  changeLabel?: string
  tone?: 'neutral' | 'green' | 'amber' | 'red'
  icon?: ReactNode
  dataTour?: string
}

export function KpiCard({ label, value, change, changeLabel, tone = 'neutral', icon, dataTour }: KpiCardProps) {
  const positive = (change ?? 0) >= 0
  return (
    <Card className="p-4" data-tour={dataTour}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[var(--color-ink-faint)]">{label}</p>
        {icon}
      </div>
      <p
        className={clsx(
          'mt-2 text-2xl font-semibold',
          tone === 'green' && 'text-[var(--color-green)]',
          tone === 'amber' && 'text-[var(--color-amber)]',
          tone === 'red' && 'text-[var(--color-red)]',
          tone === 'neutral' && 'text-[var(--color-ink)]',
        )}
      >
        {value}
      </p>
      {change !== undefined && (
        <p className={clsx('mt-1 flex items-center gap-1 text-xs font-medium', positive ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(change)}% {changeLabel ?? 'vs last period'}
        </p>
      )}
    </Card>
  )
}
