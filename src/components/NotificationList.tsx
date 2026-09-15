import { useNavigate } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import clsx from 'clsx'
import type { AppNotification } from '@/types'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/EmptyState'
import { relativeTime } from '@/lib/format'
import { useDataStore } from '@/store/dataStore'

const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info }
const COLOR = {
  success: 'text-[var(--color-green)]',
  warning: 'text-[var(--color-amber)]',
  error: 'text-[var(--color-red)]',
  info: 'text-[var(--color-blue)]',
}

export function NotificationList({ notifications, onNavigate }: { notifications: AppNotification[]; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const markNotificationRead = useDataStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useDataStore((s) => s.markAllNotificationsRead)

  if (notifications.length === 0) {
    return <EmptyState title="No notifications" description="You're all caught up." />
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={markAllNotificationsRead}>
          Mark all read
        </Button>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {notifications.map((n) => {
          const Icon = ICON[n.kind]
          return (
            <button
              key={n.id}
              onClick={() => {
                markNotificationRead(n.id)
                if (n.rfqId) navigate(`/rfqs/${n.rfqId}`)
                else if (n.quotationId) navigate(`/quotations/${n.quotationId}`)
                onNavigate?.()
              }}
              className={clsx('flex w-full items-start gap-2.5 px-1 py-3 text-left hover:bg-[var(--color-surface)]', !n.read && 'bg-[var(--color-blue-50)]/30')}
            >
              <Icon size={16} className={clsx('mt-0.5 shrink-0', COLOR[n.kind])} />
              <span className="flex-1">
                <span className={clsx('block text-sm', !n.read ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-soft)]')}>
                  {n.message}
                </span>
                <span className="text-xs text-[var(--color-ink-faint)]">{relativeTime(n.timestamp)}</span>
              </span>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-blue)]" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
