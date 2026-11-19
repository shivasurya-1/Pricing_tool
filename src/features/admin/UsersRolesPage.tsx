import { useEffect, useState } from 'react'
import { Eye, Pencil, Trash2, Plus, Shield, User, Users } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSION_ACTIONS, PERMISSION_MODULES, sameGrid, useRolePermissionsStore, type PermissionGrid } from '@/store/rolePermissionsStore'
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
import { formatDateTime, initials } from '@/lib/format'
import { ROLES } from '@/types'
import type { Role } from '@/types'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

const ACTION_LABELS: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' }

/** The matrix cell for a module: every action = Full, none = No, anything else lists the granted actions by name. */
function AccessCell({ acts = [] }: { acts?: string[] }) {
  if (acts.length === 0) return <Badge tone="neutral">No</Badge>
  if (acts.length === PERMISSION_ACTIONS.length) return <Badge tone="green">Full</Badge>
  return (
    <span className="flex flex-wrap justify-center gap-1">
      {PERMISSION_ACTIONS.filter((a) => acts.includes(a)).map((a) => (
        <Badge key={a} tone="blue">
          {ACTION_LABELS[a]}
        </Badge>
      ))}
    </span>
  )
}

const PRESETS: { label: string; icon: typeof Shield; acts: string[] }[] = [
  { label: 'Full Access', icon: Shield, acts: [...PERMISSION_ACTIONS] },
  { label: 'View Only', icon: Eye, acts: ['view'] },
  { label: 'Editor', icon: Users, acts: ['view', 'create', 'edit'] },
  { label: 'Clear All', icon: User, acts: [] },
]

/** Checkbox editor for one role's permissions: presets, a running count, and a card per module
 * with a tick-all box and one checkbox per action. Controlled by the parent's grid state. */
function PermissionEditor({ grid, setGrid, disabled }: { grid: PermissionGrid; setGrid: (g: PermissionGrid) => void; disabled?: boolean }) {
  const total = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length
  const selected = PERMISSION_MODULES.reduce((n, m) => n + (grid[m]?.length ?? 0), 0)
  const toggle = (module: string, action: string) => {
    const cur = grid[module] ?? []
    setGrid({ ...grid, [module]: cur.includes(action) ? cur.filter((a) => a !== action) : [...cur, action] })
  }
  const toggleModule = (module: string) => setGrid({ ...grid, [module]: (grid[module]?.length ?? 0) === PERMISSION_ACTIONS.length ? [] : [...PERMISSION_ACTIONS] })

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            onClick={() => setGrid(Object.fromEntries(PERMISSION_MODULES.map((m) => [m, [...p.acts]])))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            <p.icon size={14} /> {p.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
        {selected} of {total} permissions selected
      </p>
      <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
        {PERMISSION_MODULES.map((module) => {
          const acts = grid[module] ?? []
          return (
            <div key={module} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <div className="flex items-center justify-between bg-[var(--color-surface)] px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" disabled={disabled} checked={acts.length === PERMISSION_ACTIONS.length} onChange={() => toggleModule(module)} className="h-4 w-4 accent-[var(--color-navy)]" />
                  {module}
                </label>
                <span className="text-xs font-bold text-[var(--color-navy)]">
                  {acts.length}/{PERMISSION_ACTIONS.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 px-3 py-2.5 sm:grid-cols-4">
                {PERMISSION_ACTIONS.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={disabled} checked={acts.includes(a)} onChange={() => toggle(module, a)} className="h-4 w-4 accent-[var(--color-navy)]" />
                    {ACTION_LABELS[a]}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function UsersRolesPage() {
  const { loaded, loading, users, loadAll, createUser, updateUser, deleteUser } = useUsersStore()
  const pushToast = useUiStore((s) => s.pushToast)
  const myEmail = useAuthStore((s) => s.email)
  const gridFor = useRolePermissionsStore((s) => s.gridFor)
  const saveRole = useRolePermissionsStore((s) => s.saveRole)
  const rolesLoaded = useRolePermissionsStore((s) => s.loaded)
  useRolePermissionsStore((s) => s.grids) // re-render when a role's permissions are saved
  const [addOpen, setAddOpen] = useState(false)
  // Shown only when a new user's welcome email failed: their one-time set-password link.
  const [inviteLink, setInviteLink] = useState<{ username: string; url: string; hours: number } | null>(null)
  const [editing, setEditing] = useState<UserAdminDto | null>(null)
  const [deleting, setDeleting] = useState<UserAdminDto | null>(null)

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
    { key: 'role', header: 'Role', render: (u) => <Badge tone="blue">{u.role}</Badge> },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.is_active ? 'green' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'lastLogin', header: 'Last Login', render: (u) => (u.last_login ? formatDateTime(u.last_login) : '—') },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => {
        const isSelf = !!myEmail && u.email.toLowerCase() === myEmail.toLowerCase()
        return (
          <span className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={u.is_active}
              aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.username}`}
              title={isSelf ? "You can't deactivate your own account" : u.is_active ? 'Active — click to deactivate (blocks sign-in)' : 'Inactive — click to activate'}
              disabled={isSelf}
              onClick={async () => {
                try {
                  await updateUser(u.id, { is_active: !u.is_active })
                  pushToast(`${u.username} ${u.is_active ? 'deactivated' : 'activated'}.`, 'success')
                } catch (err) {
                  pushToast(err instanceof ApiError ? err.message : 'Failed to update user.', 'error')
                }
              }}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${u.is_active ? 'bg-[var(--color-green)]' : 'bg-[var(--color-border)]'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${u.is_active ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <Button size="sm" variant="secondary" icon={<Pencil size={12} />} onClick={() => setEditing(u)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Trash2 size={12} />}
              disabled={isSelf}
              title={isSelf ? "You can't delete your own account" : `Delete ${u.username}`}
              onClick={() => setDeleting(u)}
              className="text-[var(--color-red)]"
            >
              Delete
            </Button>
          </span>
        )
      },
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
        <CardHeader title="Permission Matrix" description="Edit a user in the Users card to change their role's permissions. Changes apply to every user in that role." />
        {!rolesLoaded && (
          <div className="mx-4 mt-4 rounded-md border border-[var(--color-amber-100)] bg-[var(--color-amber-50)] px-4 py-2.5 text-sm text-[var(--color-amber)]">
            Couldn't load the role permissions from the server, so the matrix below isn't accurate. Reload the page to try again.
          </div>
        )}
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                <th className="px-3 py-2">Module</th>
                {ROLES.map((r) => (
                  <th key={r} className={`px-3 py-2 text-center ${r === editing?.role ? 'bg-[var(--color-blue-50)] text-[var(--color-blue)]' : ''}`}>
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map((module) => (
                <tr key={module} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2.5 font-medium">{module}</td>
                  {ROLES.map((r) => {
                    return (
                      <td key={r} className={`px-3 py-2.5 text-center ${r === editing?.role ? 'bg-[var(--color-blue-50)]' : ''}`}>
                        <AccessCell acts={gridFor(r)[module]} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <EditUserModal
        user={editing}
        onClose={() => setEditing(null)}
        onSave={async (id, patch, grid) => {
          let step = 'update user'
          try {
            await updateUser(id, patch)
            // Permissions belong to the role: only send them when they differ from what the server has.
            if (patch.role !== 'Admin' && !sameGrid(grid, gridFor(patch.role))) {
              step = 'save permissions'
              await saveRole(patch.role, grid)
            }
            pushToast('User updated.', 'success')
            setEditing(null)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : `Failed to ${step}.`, 'error')
          }
        }}
      />

      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onDelete={async (u) => {
          try {
            await deleteUser(u.id)
            pushToast('User deleted.', 'success')
            setDeleting(null)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete user.', 'error')
          }
        }}
        onDeactivate={async (u) => {
          try {
            await updateUser(u.id, { is_active: false })
            pushToast(`${u.username} deactivated.`, 'success')
            setDeleting(null)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to deactivate user.', 'error')
          }
        }}
      />

      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={async (input) => {
          try {
            const { emailSent, setPasswordUrl, linkValidHours } = await createUser(input)
            if (emailSent) pushToast(`User created. A link to choose their password was emailed to ${input.email}.`, 'success')
            else if (setPasswordUrl) setInviteLink({ username: input.username, url: setPasswordUrl, hours: linkValidHours })
            else pushToast("User created, but no email could be sent. Once email works, they can use 'Forgot password?' on the login page.", 'warning')
            setAddOpen(false)
            return { ok: true }
          } catch (err) {
            // A 400 puts the email problem in {"email": [...]} - show it under the field.
            if (err instanceof ApiError) {
              try {
                const body = JSON.parse(err.message)
                const emailError = Array.isArray(body.email) ? body.email.join(' ') : body.email
                if (emailError) return { ok: false, emailError: String(emailError) }
              } catch {
                /* not JSON - fall through to the toast */
              }
            }
            pushToast(err instanceof ApiError ? err.message : 'Failed to create user.', 'error')
            return { ok: false }
          }
        }}
      />

      <Modal
        open={inviteLink !== null}
        onClose={() => setInviteLink(null)}
        title="Email could not be sent"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (inviteLink) void navigator.clipboard?.writeText(inviteLink.url).then(() => pushToast('Link copied.', 'success'))
              }}
            >
              Copy link
            </Button>
            <Button variant="primary" onClick={() => setInviteLink(null)}>
              Done
            </Button>
          </>
        }
      >
        {inviteLink && (
          <div className="space-y-3 text-sm">
            <p>
              <b>{inviteLink.username}</b> was created, but the welcome email couldn't be sent. Pass this one-time link to them
              privately; it lets them choose their password and works for {inviteLink.hours} hours.
            </p>
            <input readOnly value={inviteLink.url} onFocus={(e) => e.currentTarget.select()} className={inputClass} />
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Confirm a permanent delete; offers deactivating (reversible) instead. */
function DeleteUserModal({
  user,
  onClose,
  onDelete,
  onDeactivate,
}: {
  user: UserAdminDto | null
  onClose: () => void
  onDelete: (u: UserAdminDto) => Promise<void>
  onDeactivate: (u: UserAdminDto) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const name = `${user.first_name} ${user.last_name}`.trim() || user.username
  const run = async (fn: (u: UserAdminDto) => Promise<void>) => {
    setBusy(true)
    await fn(user)
    setBusy(false)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Delete user"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {user.is_active && (
            <Button variant="secondary" onClick={() => run(onDeactivate)} disabled={busy}>
              Deactivate instead
            </Button>
          )}
          <Button variant="danger" onClick={() => run(onDelete)} disabled={busy}>
            {busy ? 'Working...' : 'Delete'}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        Delete <b>{name}</b>? This can't be undone. Their account is removed; records they changed are kept. To keep the account, deactivate it instead.
      </p>
    </Modal>
  )
}

/** Edit name, email, role and the role's permissions (checkboxes). Permissions belong to the role, so saving applies them to every user in it. */
function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: UserAdminDto | null
  onClose: () => void
  onSave: (id: number, patch: { first_name: string; last_name: string; email: string; role: Role }, grid: PermissionGrid) => Promise<void>
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Sales')
  const [saving, setSaving] = useState(false)
  const gridFor = useRolePermissionsStore((s) => s.gridFor)
  const [grid, setGrid] = useState<PermissionGrid>({})

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name)
      setLastName(user.last_name)
      setEmail(user.email)
      setRole(user.role)
      setGrid(gridFor(user.role))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (!user) return null

  const handleSave = async () => {
    setSaving(true)
    await onSave(user.id, { first_name: firstName, last_name: lastName, email, role }, grid)
    setSaving(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
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
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role)
              setGrid(gridFor(e.target.value as Role))
            }}
            className={inputClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-3">
          <p className="mb-1 text-sm font-semibold">Permissions - {role}</p>
          <p className="mb-3 text-xs text-[var(--color-ink-soft)]">
            {role === 'Admin' ? 'Admin always has full access.' : `Saved permissions apply to every user in the ${role} role.`}
          </p>
          <PermissionEditor grid={grid} setGrid={setGrid} disabled={role === 'Admin'} />
        </div>
      </div>
    </Modal>
  )
}

function AddUserModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: { username: string; first_name: string; last_name: string; email: string; role: Role }) => Promise<{ ok: boolean; emailError?: string }>
}) {
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Sales')
  const [emailError, setEmailError] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setUsername('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setRole('Sales')
    setEmailError('')
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const canSave = username.trim().length > 0 && emailValid

  const handleSave = async () => {
    setSaving(true)
    const res = await onCreate({ username: username.trim(), first_name: firstName, last_name: lastName, email: email.trim(), role })
    setSaving(false)
    if (res.ok) reset()
    else if (res.emailError) setEmailError(res.emailError)
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
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
            Email <span className="text-[var(--color-red)]">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError('')
            }}
            className={`${inputClass} ${(email.trim() && !emailValid) || emailError ? 'border-[var(--color-red)]' : ''}`}
            placeholder="name@company.com"
          />
          {emailError ? (
            <p className="mt-1 text-xs text-[var(--color-red)]">{emailError}</p>
          ) : (
            email.trim() && !emailValid && <p className="mt-1 text-xs text-[var(--color-red)]">Enter a valid email address.</p>
          )}
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
        <p className="rounded-md bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-ink-soft)]">
          No password is needed here. The new user is emailed a one-time link to choose their own password (valid for 72 hours).
        </p>
      </div>
    </Modal>
  )
}
