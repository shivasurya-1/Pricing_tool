import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatDate, initials } from '@/lib/format'
import { ROLES } from '@/types'
import type { User } from '@/types'
import { useUiStore } from '@/store/uiStore'

const PERMISSION_MATRIX: { module: string; access: Record<string, string> }[] = [
  { module: 'Create RFQ', access: { Sales: 'Yes', Operations: 'No', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Operations Review', access: { Sales: 'No', Operations: 'Yes', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Sourcing', access: { Sales: 'No', Operations: 'No', Sourcing: 'Yes', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Costing', access: { Sales: 'No', Operations: 'No', Sourcing: 'No', Controlling: 'Yes', 'Approval Panel': 'View', Admin: 'Yes' } },
  { module: 'Approval', access: { Sales: 'No', Operations: 'No', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'Yes', Admin: 'Yes' } },
  { module: 'Masters', access: { Sales: 'View', Operations: 'View', Sourcing: 'View', Controlling: 'View', 'Approval Panel': 'View', Admin: 'Full' } },
]

export function UsersRolesPage() {
  const users = useDataStore((s) => s.users)
  const pushToast = useUiStore((s) => s.pushToast)

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: u.avatarColor }}>
            {initials(u.name)}
          </span>
          {u.name}
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (u) => u.email },
    { key: 'role', header: 'Role', render: (u) => <Badge tone="blue">{u.role}</Badge> },
    { key: 'department', header: 'Department', render: (u) => u.department },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.status === 'Active' ? 'green' : 'neutral'}>{u.status}</Badge> },
    { key: 'lastLogin', header: 'Last Login', render: (u) => formatDate(u.lastLogin) },
    {
      key: 'action',
      header: 'Actions',
      render: () => (
        <Button size="sm" variant="secondary" onClick={() => pushToast('User editing is not enabled in this prototype.', 'info')}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader title="Users & Roles" description={`${users.length} users across ${ROLES.length} roles`} />

      <Card className="mb-5">
        <CardHeader title="Users" />
        <DataTable columns={columns} rows={users} keyField={(u) => u.id} />
      </Card>

      <Card>
        <CardHeader title="Permission Matrix" description="Visual reference only in this prototype" />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                <th className="px-3 py-2">Module</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 py-2 text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.module} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2.5 font-medium">{row.module}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      <Badge tone={row.access[r] === 'Yes' || row.access[r] === 'Full' ? 'green' : row.access[r] === 'View' ? 'blue' : 'neutral'}>{row.access[r]}</Badge>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
