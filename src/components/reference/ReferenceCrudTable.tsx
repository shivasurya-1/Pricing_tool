import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

// Mirrors FormulasPage's own copy — camelCase-slugifies whatever's typed into a
// label-like field so an `autoFillFrom` column (e.g. Key) can track it live.
function slugifyToCamelCase(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ''
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
}

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
  /** Add-row modal only: this column auto-fills (camelCase-slugified) from the named
   * column as the user types it there, until they edit this field themselves —
   * same "Key follows Label" pattern as the Formulas page's own Add modals. */
  autoFillFrom?: string
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
  renderAddModal,
}: {
  title: string
  description?: string
  rows: T[]
  columns: ReferenceColumn<T>[]
  onCreate: (values: Record<string, string | number>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  /** Required when any column has `editable: true` — saves the changed editable
   * fields for one row. A `type: 'number'` column patches a number, any other
   * column type patches its raw string value. */
  onUpdate?: (id: number, patch: Record<string, string | number>) => Promise<void>
  addLabel?: string
  /** Adds a search box that filters rows by every column's displayed text — worth it
   * once a catalog has more than a handful of rows (e.g. ~90 bearings). */
  searchable?: boolean
  /** Replaces the built-in one-input-per-column Add modal entirely — for a resource
   * whose Add form needs to compose several visible inputs into one stored column
   * (e.g. Raw Forging Prices' several dimension fields into one Size Band string).
   * Gets the same open/close state and the same wrapped onSave (toast + close-on-
   * success + error toast) the built-in modal uses, so callers just build the form. */
  renderAddModal?: (props: { open: boolean; onClose: () => void; onSave: (values: Record<string, string | number>) => Promise<void> }) => React.ReactNode
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null)
  const [search, setSearch] = useState('')

  const submitCreate = async (values: Record<string, string | number>) => {
    try {
      await onCreate(values)
      pushToast('Row added.', 'success')
      setAddOpen(false)
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to add row.', 'error')
    }
  }

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

      {renderAddModal ? (
        renderAddModal({ open: addOpen, onClose: () => setAddOpen(false), onSave: submitCreate })
      ) : (
        <AddRowModal open={addOpen} onClose={() => setAddOpen(false)} title={addLabel} columns={columns} onSave={submitCreate} />
      )}

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
  onUpdate?: (id: number, patch: Record<string, string | number>) => Promise<void>
  onDeleteClick: () => void
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const editableColumns = columns.filter((c) => c.editable)
  const rawValue = (c: ReferenceColumn<T>) => {
    const v = (row as Record<string, unknown>)[c.key]
    // Keep a genuinely empty number as '' (not 0) so the field can actually be
    // cleared while editing instead of snapping back to a hardcoded zero.
    if (c.type === 'number') return v === null || v === undefined || v === '' ? '' : Number(v)
    return String(v ?? '')
  }
  const [draft, setDraft] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(editableColumns.map((c) => [c.key, rawValue(c)])),
  )
  const [saving, setSaving] = useState(false)
  const original = Object.fromEntries(editableColumns.map((c) => [c.key, rawValue(c)]))
  const editableKeys = editableColumns.map((c) => c.key)
  const dirty = editableKeys.some((k) => draft[k] !== original[k])

  // `draft`'s lazy initializer above only ever runs once, at mount — without this,
  // a successful save leaves the Save/Reset buttons showing forever (draft never
  // catches up to the freshly-saved row). `row` only gets a new object reference
  // when *this* row's data actually changes (the store replaces just the one
  // updated row, not the whole array), so this only resyncs when it should —
  // right after this row saves, not while editing some other row.
  useEffect(() => {
    setDraft(Object.fromEntries(editableColumns.map((c) => [c.key, rawValue(c)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])

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
          {c.editable && c.type === 'select' ? (
            <select
              value={String(draft[c.key] ?? '')}
              onChange={(e) => setDraft((prev) => ({ ...prev, [c.key]: e.target.value }))}
              className="w-full min-w-[140px] rounded-md border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-blue)]"
            >
              <option value="">—</option>
              {c.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : c.editable ? (
            <input
              type={c.type === 'number' ? 'number' : 'text'}
              value={draft[c.key] ?? ''}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  // '' stays '' while clearing the field — only coerce to a number once
                  // something's actually typed, otherwise backspacing snaps back to 0.
                  [c.key]: c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
                }))
              }
              className={clsx(
                'rounded-md border border-[var(--color-border)] px-2 py-1 text-sm outline-none focus:border-[var(--color-blue)]',
                c.type === 'number' ? 'w-28' : 'w-full min-w-[140px]',
              )}
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
  const [autoFilledKeysEdited, setAutoFilledKeysEdited] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const setField = (key: string, v: string, type: 'text' | 'number' | 'select', isAutoFillTarget: boolean) => {
    if (isAutoFillTarget) setAutoFilledKeysEdited((prev) => new Set(prev).add(key))
    setValues((prev) => {
      const next = { ...prev, [key]: type === 'number' ? (v === '' ? '' : Number(v)) : v }
      for (const c of columns) {
        if (c.autoFillFrom === key && !autoFilledKeysEdited.has(c.key)) next[c.key] = slugifyToCamelCase(v)
      }
      return next
    })
  }

  const canSave = columns.every((c) => !c.required || (values[c.key] !== undefined && values[c.key] !== ''))

  const handleSave = async () => {
    setSaving(true)
    await onSave(values)
    setSaving(false)
    setValues({})
    setAutoFilledKeysEdited(new Set())
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
              <select
                value={String(values[c.key] ?? '')}
                onChange={(e) => setField(c.key, e.target.value, c.type, !!c.autoFillFrom)}
                className={inputClass}
              >
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
                onChange={(e) => setField(c.key, e.target.value, c.type, !!c.autoFillFrom)}
                className={inputClass}
              />
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
