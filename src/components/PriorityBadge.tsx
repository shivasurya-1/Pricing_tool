import type { Priority } from '@/types'
import { Badge, type Tone } from '@/components/ui/Badge'

const TONE: Record<Priority, Tone> = {
  Low: 'neutral',
  Medium: 'blue',
  High: 'amber',
  Urgent: 'red',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={TONE[priority]}>{priority}</Badge>
}
