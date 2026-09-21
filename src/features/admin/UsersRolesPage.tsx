import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useUsersStore, type UserAdminDto } from '@/store/usersStore'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/EmptyState'
import { formatDate, initials } from '@/lib/format'
import { ROLES } from '@/types'
import type { Role } from '@/types'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

const PERMISSION_MATRIX: { module: string; access: Record<string, string> }[] = [
  { module: 'Create RFQ', access: { Sales: 'Yes', Operations: 'No', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Operations Review', access: { Sales: 'No', Operations: 'Yes', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Sourcing', access: { Sales: 'No', Operations: 'No', Sourcing: 'Yes', Controlling: 'No', 'Approval Panel': 'No', Admin: 'Yes' } },
  { module: 'Costing', access: { Sales: 'No', Operations: 'No', Sourcing: 'No', Controlling: 'Yes', 'Approval Panel': 'View', Admin: 'Yes' } },
  { module: 'Approval', access: { Sales: 'No', Operations: 'No', Sourcing: 'No', Controlling: 'No', 'Approval Panel': 'Yes', Admin: 'Yes' } },
  { module: 'Masters', access: { Sales: 'View', Operations: 'View', Sourcing: 'View', Controlling: 'View', 'Approval Panel': 'View', Admin: 'Full' } },
]

export function UsersRolesPage() {
  const { loaded, loading, users, loadAll, createUser, updateUser } = useUsersStore()
  const pushToast = useUiStore((s) => s.pushToast)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <EmptyState title="Loading users..." />
  if (!loaded) {
    return (
      <div>
        <PageHeader title="Users & Roles" description="Real account administration." />
        <EmptyState title="Backend not reachable" description="This page needs the Django backend running." />
      </div>
    )
  }

  const columns: Column<UserAdminDto>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-blue)] text-[10px] font-semibold text-white">
            {initials(`${u.first_name} ${u.last_name}`.trim() || u.username)}
          </span>
          {`${u.first_name} ${u.last_name}`.trim() || u.username}
        </span>
      ),
    },
    { key: 'username', header: 'Username', render: (u) => u.username },
    { key: 'email', header: 'Email', render: (u) => u.email },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <select
          value={u.role}
          onChange={async (e) => {
            try {
              await updateUser(u.id, { role: e.target.value as UserAdminDto['role'] })
              pushToast(`${u.username}'s role updated.`, 'success')
            } catch (err) {
              pushToast(err instanceof ApiError ? err.message : 'Failed to update role.', 'error')
            }
          }}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.is_active ? 'green' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'lastLogin', header: 'Last Login', render: (u) => (u.last_login ? formatDate(u.last_login) : '—') },
    {
      key: 'action',
      header: 'Action',
      render: (u) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await updateUser(u.id, { is_active: !u.is_active })
              pushToast(`${u.username} ${u.is_active ? 'deactivated' : 'activated'}.`, 'success')
            } catch (err) {
              pushToast(err instanceof ApiError ? err.message : 'Failed to update user.', 'error')
            }
          }}
        >
          {u.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description={`${users.length} users across ${ROLES.length} roles`}
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
            Add User
          </Button>
        }
      />

      <Card className="mb-5">
        <CardHeader title="Users" />
        <DataTable columns={columns} rows={users} keyField={(u) => String(u.id)} />
      </Card>

      <Card>
        <CardHeader title="Permission Matrix" description="Visual reference — enforced server-side on every request, not just here" />
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

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={async (input) => {
          try {
            await createUser(input)
            pushToast(`${input.username} added.`, 'success')
            setAddOpen(false)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to create user.', 'error')
          }
        }}
      />
    </div>
  )
}

function AddUserModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: { username: string; first_name: string; last_name: string; email: string; role: Role; password: string }) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Sales')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setUsername('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setRole('Sales')
    setPassword('')
  }

  const canSave = username.trim().length > 0 && password.trim().length >= 8

  const handleSave = async () => {
    setSaving(true)
    await onCreate({ username: username.trim(), first_name: firstName, last_name: lastName, email, role, password })
    setSaving(false)
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Add User"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            Add User
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Username <span className="text-[var(--color-red)]">*</span>
          </label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">First Name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Last Name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Password <span className="text-[var(--color-red)]">*</span>
          </label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="At least 8 characters" />
        </div>
      </div>
    </Modal>
  )
}
