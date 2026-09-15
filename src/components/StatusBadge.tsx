import type { Stage } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { STAGE_TONE } from '@/lib/workflow'

export function StatusBadge({ stage }: { stage: Stage }) {
  return <Badge tone={STAGE_TONE[stage]}>{stage}</Badge>
}
