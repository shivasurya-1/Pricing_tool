import { useMemo, useState } from 'react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime } from '@/lib/format'
import type { AuditEvent } from '@/types'

export function AuditLogPage() {
  const auditLog = useDataStore((s) => s.auditLog)
  const [userFilter, setUserFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [selected, setSelected] = useState<AuditEvent | null>(null)

  const users = useMemo(() => [...new Set(auditLog.map((a) => a.user))].sort(), [auditLog])
  const roles = useMemo(() => [...new Set(auditLog.map((a) => a.role))], [auditLog])
  const modules = useMemo(() => [...new Set(auditLog.map((a) => a.module))], [auditLog])

  const sorted = useMemo(() => [...auditLog].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [auditLog])

  const filtered = sorted.filter((a) => {
    if (userFilter && a.user !== userFilter) return false
    if (roleFilter && a.role !== roleFilter) return false
    if (moduleFilter && a.module !== moduleFilter) return false
    return true
  })

  const columns: Column<AuditEvent>[] = [
    { key: 'time', header: 'Date/Time', render: (a) => formatDateTime(a.timestamp) },
    { key: 'user', header: 'User', render: (a) => a.user },
    { key: 'role', header: 'Role', render: (a) => a.role },
    { key: 'module', header: 'Module', render: (a) => a.module },
    { key: 'record', header: 'Record', render: (a) => <span className="font-medium text-[var(--color-blue)]">{a.record}</span> },
    { key: 'action', header: 'Action', render: (a) => a.action },
    { key: 'prev', header: 'Previous Status', render: (a) => (a.previousStatus ? <StatusBadge stage={a.previousStatus} /> : '—') },
    { key: 'new', header: 'New Status', render: (a) => (a.newStatus ? <StatusBadge stage={a.newStatus} /> : '—') },
  ]

  return (
    <div>
      <PageHeader title="Audit Log" description={`${filtered.length} of ${auditLog.length} events`} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
          <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <DataTable columns={columns} rows={filtered} keyField={(a) => a.id} onRowClick={setSelected} />
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Audit Event Details">
        {selected && (
          <div className="space-y-3 text-sm">
            <Row label="Date/Time" value={formatDateTime(selected.timestamp)} />
            <Row label="User" value={selected.user} />
            <Row label="Role" value={selected.role} />
            <Row label="Module" value={selected.module} />
            <Row label="Record" value={selected.record} />
            <Row label="Action" value={selected.action} />
            {selected.previousStatus && <Row label="Previous Status" value={selected.previousStatus} />}
            {selected.newStatus && <Row label="New Status" value={selected.newStatus} />}
            {selected.comment && <Row label="Comment" value={selected.comment} />}
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-[var(--color-border)] py-1.5">
      <span className="text-[var(--color-ink-faint)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
