import { useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

export interface ReferenceColumn<T> {
  key: string
  header: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  required?: boolean
  /** Formats the value for display in the table; defaults to String(value). */
  format?: (row: T) => string
  /** Renders as an inline-editable number input on an existing row (see `onUpdate`),
   * instead of plain read-only text. Never applies to the Add-row modal's own
   * required-ness — that's controlled separately by `required`. */
  editable?: boolean
}

/**
 * Shared add/delete/list table for a reference-data resource (a bearing/sleeve/housing/
 * lagging/locking-device catalog row, a raw forging rate band, an in-house-hour rate
 * row) — every one of these is the same shape: a flat table of simple fields, add a
 * new row, delete an existing one. One generic component instead of bespoke UI per
 * page, reusing Card/Modal/ConfirmDialog exactly as the Formulas page already does.
 */
export function ReferenceCrudTable<T extends { id: number }>({
  title,
  description,
  rows,
  columns,
  onCreate,
  onDelete,
  onUpdate,
  addLabel = 'Add Row',
  searchable = false,
}: {
  title: string
  description?: string
  rows: T[]
  columns: ReferenceColumn<T>[]
  onCreate: (values: Record<string, string | number>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  /** Required when any column has `editable: true` — saves the changed editable
   * fields for one row. */
  onUpdate?: (id: number, patch: Record<string, number>) => Promise<void>
  addLabel?: string
  /** Adds a search box that filters rows by every column's displayed text — worth it
   * once a catalog has more than a handful of rows (e.g. ~90 bearings). */
  searchable?: boolean
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null)
  const [search, setSearch] = useState('')

  const filteredRows = useMemo(() => {
    if (!searchable || !search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((row) =>
      columns.some((c) => (c.format ? c.format(row) : String((row as Record<string, unknown>)[c.key] ?? '')).toLowerCase().includes(q)),
    )
  }, [rows, columns, search, searchable])

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
            {addLabel}
          </Button>
        }
      />
      {searchable && (
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <Search size={14} className="text-[var(--color-ink-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full max-w-xs bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
          />
          <span className="ml-auto text-xs text-[var(--color-ink-faint)]">
            {filteredRows.length} of {rows.length}
          </span>
        </div>
      )}
      <div className="max-h-[400px] overflow-y-auto overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2">
                  {c.header}
                </th>
              ))}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-[var(--color-ink-faint)]">
                  {rows.length === 0 ? 'No rows yet — add one to get started.' : 'No rows match your search.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <EditableRow key={row.id} row={row} columns={columns} onUpdate={onUpdate} onDeleteClick={() => setDeleteTarget(row)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddRowModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={addLabel}
        columns={columns}
        onSave={async (values) => {
          try {
            await onCreate(values)
            pushToast('Row added.', 'success')
            setAddOpen(false)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to add row.', 'error')
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await onDelete(deleteTarget.id)
            pushToast('Row deleted.', 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete row.', 'error')
          } finally {
            setDeleteTarget(null)
          }
        }}
        title="Delete Row"
        description="Remove this row? This can't be undone."
        confirmLabel="Delete"
        danger
      />
    </Card>
  )
}

function EditableRow<T extends { id: number }>({
  row,
  columns,
  onUpdate,
  onDeleteClick,
}: {
  row: T
  columns: ReferenceColumn<T>[]
  onUpdate?: (id: number, patch: Record<string, number>) => Promise<void>
  onDeleteClick: () => void
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const editableKeys = columns.filter((c) => c.editable).map((c) => c.key)
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(editableKeys.map((k) => [k, Number((row as Record<string, unknown>)[k] ?? 0)])),
  )
  const [saving, setSaving] = useState(false)
  const original = Object.fromEntries(editableKeys.map((k) => [k, Number((row as Record<string, unknown>)[k] ?? 0)]))
  const dirty = editableKeys.some((k) => draft[k] !== original[k])

  const handleSave = async () => {
    if (!onUpdate) return
    setSaving(true)
    try {
      await onUpdate(row.id, draft)
      pushToast('Saved.', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to save.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className={clsx('border-b border-[var(--color-border)] last:border-0', dirty && 'bg-[var(--color-amber-50)]')}>
      {columns.map((c, j) => (
        <td key={c.key} className={`px-4 py-2.5 ${j === 0 ? 'font-medium' : ''}`}>
          {c.editable ? (
            <input
              type="number"
              value={draft[c.key] ?? 0}
              onChange={(e) => setDraft((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))}
              className="w-28 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-blue)]"
            />
          ) : c.format ? (
            c.format(row)
          ) : (
            String((row as Record<string, unknown>)[c.key] ?? '')
          )}
        </td>
      ))}
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-1.5">
          {dirty && (
            <>
              <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => setDraft(original)}>
                Reset
              </Button>
              <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={handleSave} disabled={saving}>
                Save
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={onDeleteClick}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  )
}

function AddRowModal<T>({
  open,
  onClose,
  title,
  columns,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  columns: ReferenceColumn<T>[]
  onSave: (values: Record<string, string | number>) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string | number>>({})
  const [saving, setSaving] = useState(false)

  const setField = (key: string, v: string, type: 'text' | 'number' | 'select') => {
    setValues((prev) => ({ ...prev, [key]: type === 'number' ? (v === '' ? '' : Number(v)) : v }))
  }

  const canSave = columns.every((c) => !c.required || (values[c.key] !== undefined && values[c.key] !== ''))

  const handleSave = async () => {
    setSaving(true)
    await onSave(values)
    setSaving(false)
    setValues({})
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        setValues({})
      }}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {columns.map((c) => (
          <div key={c.key}>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
              {c.header} {c.required && <span className="text-[var(--color-red)]">*</span>}
            </label>
            {c.type === 'select' ? (
              <select value={String(values[c.key] ?? '')} onChange={(e) => setField(c.key, e.target.value, c.type)} className={inputClass}>
                <option value="">Select...</option>
                {c.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={c.type === 'number' ? 'number' : 'text'}
                value={values[c.key] ?? ''}
                onChange={(e) => setField(c.key, e.target.value, c.type)}
                className={inputClass}
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
