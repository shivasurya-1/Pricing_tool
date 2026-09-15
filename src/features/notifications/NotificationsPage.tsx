import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { NotificationList } from '@/components/NotificationList'

export function NotificationsPage() {
  const role = useAuthStore((s) => s.role)
  const notifications = useDataStore((s) => s.notifications)
  const relevant = notifications.filter((n) => !n.targetRole || n.targetRole === role)

  return (
    <div>
      <PageHeader title="Notifications" description={`${relevant.filter((n) => !n.read).length} unread`} />
      <Card className="p-3">
        <NotificationList notifications={relevant} />
      </Card>
    </div>
  )
}
