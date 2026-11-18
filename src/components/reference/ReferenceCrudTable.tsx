import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, RotateCcw, Save, Search, Settings2, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'
import { ManageFieldsDialog } from './ManageFieldsDialog'
import {
  cellValue,
  EXTRA_PREFIX,
  fieldKeyFromLabel,
  splitExtraValues,
  useMasterTableFields,
  type FieldTypeInfo,
  type MasterFieldType,
} from './masterTableFields'

interface FieldTools {
  /** Adds a field to the table; resolves true once it's there. */
  addField: (label: string, fieldType: MasterFieldType, options: string[]) => Promise<boolean>
  /** Renames a field and/or changes its type (Text <-> Number, only while it has no data). */
  editField: (columnKey: string, label: string, fieldType?: MasterFieldType) => Promise<boolean>
  /** Per column key: current type and why it can't change (see FieldTypeInfo). */
  typeInfo: Record<string, FieldTypeInfo>
  /** Opens Manage Fields (rename/hide built-ins, edit added fields). */
  manage: () => void
}

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
  tableKey,
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
  /** The table's backend slug (e.g. "shell-bands"). Turns on "Add Field" / "Manage
   * Fields": user-added fields become extra columns (values sent to onCreate/onUpdate
   * under `extra` — a page's onCreate forwards them with `...extraOf(v)`), and built-in
   * columns can be renamed or hidden. */
  tableKey?: string
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null)
  const [editTarget, setEditTarget] = useState<T | null>(null)
  const [manageFields, setManageFields] = useState<{ open: boolean; adding: boolean }>({ open: false, adding: false })
  const [search, setSearch] = useState('')
  const tableFields = useMasterTableFields(tableKey)

  // The page's own columns with renames/hides applied, followed by the user-added fields.
  const effectiveColumns = useMemo<ReferenceColumn<T>[]>(() => {
    if (!tableKey) return columns
    const overrides = new Map(tableFields.fields.filter((f) => f.is_builtin).map((f) => [f.key, f]))
    const builtin = columns
      .filter((c) => !overrides.get(c.key)?.hidden || c.required)
      .map((c) => {
        const next = overrides.has(c.key) ? { ...c, header: overrides.get(c.key)!.label } : c
        // A built-in column whose type was switched (Text <-> Number) gets that input;
        // a switched-to-Text number column shows its raw text, not a currency format.
        const info = tableFields.typeInfo[c.key]
        if (info && info.type !== info.natural_type && (info.type === 'text' || info.type === 'number') && c.type !== 'select') {
          return { ...next, type: info.type, format: info.type === 'text' ? undefined : next.format }
        }
        return next
      })
    const custom: ReferenceColumn<T>[] = tableFields.fields
      .filter((f) => !f.is_builtin && !f.hidden)
      .map((f) => {
        const key = `${EXTRA_PREFIX}${f.key}`
        return {
          key,
          header: f.label,
          type: f.field_type,
          options: f.options,
          required: f.required,
          editable: true,
          format: (row: T) => {
            const v = cellValue(row, key)
            return v === null || v === undefined || v === '' ? '—' : String(v)
          },
        }
      })
    return [...builtin, ...custom]
  }, [columns, tableKey, tableFields.fields, tableFields.typeInfo])

  // A field's type is locked once records hold values for it, so re-check after any
  // record change.
  const refreshTypeLocks = () => {
    if (tableKey) tableFields.reload().catch(() => undefined)
  }

  const submitCreate = async (values: Record<string, string | number>) => {
    // A built-in Number column switched to Text: pages convert number columns with
    // Number(...) in their onCreate, which would drop text — so its value also rides
    // along in `extra`, where the backend picks it up (ExtraFieldsSerializerMixin).
    const withText = { ...values }
    for (const [key, info] of Object.entries(tableFields.typeInfo)) {
      if (!key.startsWith(EXTRA_PREFIX) && info.natural_type === 'number' && info.type === 'text' && key in withText) {
        withText[`${EXTRA_PREFIX}${key}`] = withText[key]
      }
    }
    try {
      await onCreate(splitExtraValues(withText))
      refreshTypeLocks()
      pushToast('Row added.', 'success')
      setAddOpen(false)
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to add row.', 'error')
    }
  }

  const update = onUpdate
    ? async (id: number, patch: Record<string, string | number>) => {
        await onUpdate(id, splitExtraValues(patch))
        refreshTypeLocks()
      }
    : undefined

  // In-form field tools (Add / Edit row modals): add a field by name, delete one you added,
  // or open Manage Fields to rename/hide built-ins.
  const fieldTools: FieldTools | undefined = tableKey
    ? {
        addField: async (label, fieldType, options) => {
          const taken = new Set([...columns.map((c) => c.key), ...tableFields.fields.map((f) => f.key)])
          const base = fieldKeyFromLabel(label) || 'field'
          let key = base
          for (let n = 2; taken.has(key); n++) key = `${base}_${n}`
          try {
            await tableFields.create({ key, label, field_type: fieldType, options, order: tableFields.fields.filter((f) => !f.is_builtin).length })
            pushToast(`'${label}' added.`, 'success')
            return true
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to add field.', 'error')
            return false
          }
        },
        editField: async (columnKey, label, fieldType) => {
          try {
            if (columnKey.startsWith(EXTRA_PREFIX)) {
              const field = tableFields.fields.find((f) => !f.is_builtin && `${EXTRA_PREFIX}${f.key}` === columnKey)
              if (!field) return false
              await tableFields.update(field.id, { key: field.key, label, ...(fieldType ? { field_type: fieldType } : {}) })
            } else {
              // A built-in column: rename through its override (created on first rename).
              const override = tableFields.fields.find((f) => f.is_builtin && f.key === columnKey)
              const patch = { key: columnKey, label, ...(fieldType ? { field_type: fieldType } : {}) }
              if (override) await tableFields.update(override.id, patch)
              else await tableFields.create(patch)
            }
            pushToast(`'${label}' saved.`, 'success')
            return true
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to save field.', 'error')
            return false
          }
        },
        manage: () => setManageFields({ open: true, adding: false }),
        typeInfo: tableFields.typeInfo,
      }
    : undefined

  const submitEdit = async (values: Record<string, string | number>) => {
    if (!update || !editTarget) return
    try {
      await update(editTarget.id, values)
      pushToast('Saved.', 'success')
      setEditTarget(null)
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to save.', 'error')
    }
  }

  const filteredRows = useMemo(() => {
    if (!searchable || !search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((row) =>
      effectiveColumns.some((c) => (c.format ? c.format(row) : String(cellValue(row, c.key) ?? '')).toLowerCase().includes(q)),
    )
  }, [rows, effectiveColumns, search, searchable])

  const editableColumns = effectiveColumns.filter((c) => c.editable)

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
              {effectiveColumns.map((c) => (
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
                <td colSpan={effectiveColumns.length + 1} className="px-4 py-6 text-center text-[var(--color-ink-faint)]">
                  {rows.length === 0 ? 'No rows yet — add one to get started.' : 'No rows match your search.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <EditableRow
                  key={row.id}
                  row={row}
                  columns={effectiveColumns}
                  onUpdate={update}
                  onEditClick={update && editableColumns.length > 0 ? () => setEditTarget(row) : undefined}
                  onDeleteClick={() => setDeleteTarget(row)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {renderAddModal ? (
        renderAddModal({ open: addOpen, onClose: () => setAddOpen(false), onSave: submitCreate })
      ) : (
        <AddRowModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title={addLabel}
          columns={effectiveColumns}
          onSave={submitCreate}
          fieldTools={fieldTools}
        />
      )}

      {editTarget && (
        <AddRowModal
          open
          onClose={() => setEditTarget(null)}
          title={`Edit — ${String(cellValue(editTarget, effectiveColumns[0]?.key ?? 'id') ?? '')}`}
          // A user-added field's "required" applies to new records only (as on the backend),
          // so older records stay editable before anyone fills it in.
          columns={editableColumns.map((c) => (c.key.startsWith(EXTRA_PREFIX) ? { ...c, required: false } : c))}
          initialValues={Object.fromEntries(
            editableColumns.map((c) => {
              const v = cellValue(editTarget, c.key)
              return [c.key, v === null || v === undefined ? '' : c.type === 'number' ? Number(v) : String(v)]
            }),
          )}
          onSave={submitEdit}
          fieldTools={fieldTools}
        />
      )}

      {tableKey && (
        <ManageFieldsDialog
          open={manageFields.open}
          startAdding={manageFields.adding}
          onClose={() => setManageFields({ open: false, adding: false })}
          tableTitle={title}
          builtinColumns={columns.map((c) => ({ key: c.key, header: c.header, required: c.required }))}
          fields={tableFields.fields}
          typeInfo={tableFields.typeInfo}
          onCreate={tableFields.create}
          onUpdate={tableFields.update}
          onDelete={tableFields.remove}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await onDelete(deleteTarget.id)
            refreshTypeLocks()
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
  onEditClick,
  onDeleteClick,
}: {
  row: T
  columns: ReferenceColumn<T>[]
  onUpdate?: (id: number, patch: Record<string, string | number>) => Promise<void>
  onEditClick?: () => void
  onDeleteClick: () => void
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  const editableColumns = columns.filter((c) => c.editable)
  const rawValue = (c: ReferenceColumn<T>) => {
    const v = cellValue(row, c.key)
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
  // Also when the editable columns change (a field added, removed or hidden).
  const editableKeySignature = editableColumns.map((c) => c.key).join('|')
  useEffect(() => {
    setDraft(Object.fromEntries(editableColumns.map((c) => [c.key, rawValue(c)])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, editableKeySignature])

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
            String(cellValue(row, c.key) ?? '')
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
          {onEditClick && !dirty && (
            <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={onEditClick}>
              Edit
            </Button>
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
  initialValues,
  fieldTools,
}: {
  open: boolean
  onClose: () => void
  title: string
  columns: ReferenceColumn<T>[]
  onSave: (values: Record<string, string | number>) => Promise<void>
  /** Pre-fills the form (the row Edit modal). */
  initialValues?: Record<string, string | number>
  /** In-form field management: a "New field" row at the bottom, edit icons on every field. */
  fieldTools?: FieldTools
}) {
  const [values, setValues] = useState<Record<string, string | number>>(initialValues ?? {})
  const [autoFilledKeysEdited, setAutoFilledKeysEdited] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null)

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
    // Only the fields still on the form (one may have been deleted while it was open).
    const onForm = new Set(columns.map((c) => c.key))
    await onSave(Object.fromEntries(Object.entries(values).filter(([k]) => onForm.has(k))))
    setSaving(false)
    setValues(initialValues ?? {})
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
            {fieldTools && editingFieldKey === c.key ? (
              <FieldLabelEditor column={c} fieldTools={fieldTools} onDone={() => setEditingFieldKey(null)} />
            ) : (
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-[var(--color-ink-soft)]">
                  {c.header} {c.required && <span className="text-[var(--color-red)]">*</span>}
                </label>
                {fieldTools && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingFieldKey(c.key)}
                      className="text-[var(--color-ink-faint)] hover:text-[var(--color-blue)]"
                      title={`Edit the field '${c.header}'`}
                      aria-label={`Edit field ${c.header}`}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
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
        {fieldTools && <NewFieldRow fieldTools={fieldTools} />}
      </div>
    </Modal>
  )
}

/** The "New field" row at the bottom of the Add / Edit form: type a name, pick a type,
 * Add — the field is created on the table and shows up in the form right away. */
function NewFieldRow({ fieldTools }: { fieldTools: FieldTools }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<MasterFieldType>('text')
  const [saving, setSaving] = useState(false)
  const canAdd = label.trim() && !saving

  const reset = () => {
    setLabel('')
    setFieldType('text')
  }

  const add = async () => {
    setSaving(true)
    const ok = await fieldTools.addField(label.trim(), fieldType, [])
    setSaving(false)
    if (ok) {
      reset()
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between border-t border-dashed border-[var(--color-border)] pt-3">
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-medium text-[var(--color-blue)] hover:underline">
          <Plus size={12} /> Add New Field
        </button>
        <button type="button" onClick={fieldTools.manage} className="flex items-center gap-1 text-xs text-[var(--color-ink-faint)] hover:underline">
          <Settings2 size={12} /> Manage fields
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-[var(--color-blue)] bg-[var(--color-blue-50)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--color-ink)]">New Field</span>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(false)
          }}
          className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          aria-label="Cancel new field"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdd) add()
          }}
          placeholder="New field name, e.g. Coating Type"
          className={inputClass}
        />
        <TextNumberToggle value={fieldType} onChange={setFieldType} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="primary" icon={<Plus size={12} />} onClick={add} disabled={!canAdd}>
          Add Field
        </Button>
      </div>
    </div>
  )
}

/** Field type picker for added fields: Text or Number only. */
function TextNumberToggle({ value, onChange, disabled = false }: { value: MasterFieldType; onChange: (t: MasterFieldType) => void; disabled?: boolean }) {
  return (
    <div className={clsx('flex overflow-hidden rounded-md border border-[var(--color-border)] text-sm', disabled && 'opacity-50')}>
      {(['text', 'number'] as const).map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t)}
          className={clsx(
            'px-3 py-1.5 capitalize disabled:cursor-not-allowed',
            value === t ? 'bg-[var(--color-blue)] text-white' : 'bg-[var(--color-surface-alt)] text-[var(--color-ink-soft)]',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/** Inline rename of one form field (✏️ next to its label). A built-in field can only be
 * renamed — pricing reads it by name; a field you added can also switch Text/Number. */
function FieldLabelEditor<T>({ column, fieldTools, onDone }: { column: ReferenceColumn<T>; fieldTools: FieldTools; onDone: () => void }) {
  const info = fieldTools.typeInfo[column.key]
  // A choices column (e.g. Sourcing) or a page-defined dropdown keeps its type.
  const showType = column.type !== 'select' && (!info || info.natural_type !== 'select')
  const lockedReason = info?.locked_reason ?? null
  const [label, setLabel] = useState(column.header)
  const [fieldType, setFieldType] = useState<MasterFieldType>(column.type === 'number' ? 'number' : 'text')
  const [saving, setSaving] = useState(false)
  const typeChanged = showType && fieldType !== column.type
  const changed = label.trim() !== column.header || typeChanged
  const canSave = label.trim() && changed && !saving

  const save = async () => {
    setSaving(true)
    const ok = await fieldTools.editField(column.key, label.trim(), typeChanged ? fieldType : undefined)
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <div className="mb-1 rounded-md bg-[var(--color-blue-50)] p-1.5">
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) save()
          if (e.key === 'Escape') onDone()
        }}
        className={clsx(inputClass, 'py-1 text-xs')}
        aria-label="Field name"
      />
      {showType && <TextNumberToggle value={fieldType} onChange={setFieldType} disabled={!!lockedReason} />}
      <Button size="sm" variant="primary" onClick={save} disabled={!canSave}>
        Save
      </Button>
      <button type="button" onClick={onDone} className="text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]" aria-label="Cancel edit">
        <X size={14} />
      </button>
    </div>
    {showType && lockedReason && <p className="mt-1 px-1 text-[11px] text-[var(--color-ink-faint)]">{lockedReason}</p>}
    </div>
  )
}
