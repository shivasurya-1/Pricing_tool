import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { deriveTasksForRole } from '@/lib/tasks'
import { ageInDays, formatDate } from '@/lib/format'
import type { Task } from '@/types'

type FilterKey = 'All' | 'Due Today' | 'Overdue' | 'High Priority'

export function MyTasksPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.role)
  const rfqs = useDataStore((s) => s.rfqs)
  const [filter, setFilter] = useState<FilterKey>('All')

  const allTasks = useMemo(() => deriveTasksForRole(rfqs, role), [rfqs, role])

  const filtered = allTasks.filter((t) => {
    const age = ageInDays(t.createdAt)
    if (filter === 'Due Today') return age >= 2 && age <= 3
    if (filter === 'Overdue') return age > 5
    if (filter === 'High Priority') return t.priority === 'High' || t.priority === 'Urgent'
    return true
  })

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', render: (t) => <span className="font-medium">{t.title}</span> },
    { key: 'rfq', header: 'RFQ', render: (t) => <span className="text-[var(--color-blue)]">{t.rfqNumber}</span> },
    { key: 'customer', header: 'Customer', render: (t) => t.customerName },
    { key: 'stage', header: 'Stage', render: (t) => <StatusBadge stage={t.stage} /> },
    { key: 'priority', header: 'Priority', render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'due', header: 'Due Date', render: (t) => formatDate(t.dueDate) },
    { key: 'age', header: 'Age', render: (t) => `${ageInDays(t.createdAt)}d` },
    { key: 'assignedTo', header: 'Assigned To', render: (t) => t.role },
    {
      key: 'action',
      header: 'Action',
      render: (t) => (
        <Button size="sm" variant="primary" onClick={() => navigate(`/rfqs/${t.rfqId}`)}>
          Open
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="My Tasks" description={`${role} task center — ${allTasks.length} item(s) waiting`} />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-[var(--color-border)] p-3">
          {(['All', 'Due Today', 'Overdue', 'High Priority'] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]' : 'border-[var(--color-border)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <DataTable
          columns={columns}
          rows={filtered}
          keyField={(t) => t.id}
          onRowClick={(t) => navigate(`/rfqs/${t.rfqId}`)}
          emptyTitle="No tasks"
          emptyDescription="Nothing matches this filter right now."
        />
      </Card>
    </div>
  )
}
