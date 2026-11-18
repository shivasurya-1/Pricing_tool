import { useState } from 'react'
import { Pencil, Plus, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'
import {
  EXTRA_PREFIX,
  fieldKeyFromLabel,
  type FieldTypeInfo,
  type MasterFieldType,
  type MasterTableFieldDto,
  type MasterTableFieldInput,
} from './masterTableFields'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'
const labelClass = 'mb-1 block text-xs font-medium text-[var(--color-ink-soft)]'

export interface BuiltinColumnInfo {
  key: string
  header: string
  required?: boolean
}

interface Draft {
  label: string
  key: string
  keyEdited: boolean
  field_type: MasterFieldType
  optionsText: string
  required: boolean
  hidden: boolean
}

const emptyDraft: Draft = { label: '', key: '', keyEdited: false, field_type: 'text', optionsText: '', required: false, hidden: false }

/**
 * "Manage Fields" for one master-data table: add and edit the fields you added (no delete),
 * and rename or hide the built-in ones (built-ins are never deleted: pricing reads them
 * by name). Opens straight on the Add form when `startAdding` is set.
 */
export function ManageFieldsDialog({
  open,
  onClose,
  tableTitle,
  builtinColumns,
  fields,
  onCreate,
  onUpdate,
  onDelete,
  startAdding = false,
  typeInfo = {},
}: {
  open: boolean
  onClose: () => void
  tableTitle: string
  builtinColumns: BuiltinColumnInfo[]
  fields: MasterTableFieldDto[]
  onCreate: (input: MasterTableFieldInput) => Promise<void>
  onUpdate: (id: number, patch: Partial<MasterTableFieldInput>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  startAdding?: boolean
  /** Type locks per field ("extra.<key>" for added fields): a type can change only while
   * the field has no data. */
  typeInfo?: Record<string, FieldTypeInfo>
}) {
  const pushToast = useUiStore((s) => s.pushToast)
  // null = list view; 'new' = adding; a number = editing that user-added field.
  const [editing, setEditing] = useState<'new' | number | null>(startAdding ? 'new' : null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  // Reopening the dialog goes back to its starting view.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEditing(startAdding ? 'new' : null)
      setDraft(emptyDraft)
    }
  }

  const customFields = fields.filter((f) => !f.is_builtin)
  // Editing an added field that already has data: its type is locked (backend enforces too).
  const editingField = typeof editing === 'number' ? customFields.find((f) => f.id === editing) : undefined
  const typeLockedReason = editingField ? (typeInfo[`${EXTRA_PREFIX}${editingField.key}`]?.locked_reason ?? null) : null
  const overrides = new Map(fields.filter((f) => f.is_builtin).map((f) => [f.key, f]))
  const takenKeys = new Set([...builtinColumns.map((c) => c.key), ...customFields.map((f) => f.key)])

  const run = async (action: () => Promise<void>, success: string) => {
    setSaving(true)
    try {
      await action()
      pushToast(success, 'success')
      return true
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Something went wrong.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (field: MasterTableFieldDto) => {
    setEditing(field.id)
    setDraft({
      label: field.label,
      key: field.key,
      keyEdited: true,
      field_type: field.field_type,
      optionsText: field.options.join(', '),
      required: field.required,
      hidden: field.hidden,
    })
  }

  const options = draft.optionsText.split(',').map((o) => o.trim()).filter(Boolean)
  const keyError =
    editing === 'new'
      ? !draft.key
        ? 'Key is required.'
        : !/^[a-z][a-z0-9_]*$/.test(draft.key)
          ? 'Lowercase letters, digits and _ only, starting with a letter.'
          : takenKeys.has(draft.key)
            ? 'This table already has a field with this key.'
            : null
      : null
  const canSaveDraft = draft.label.trim() && !keyError && (draft.field_type !== 'select' || options.length > 0)

  const saveDraft = async () => {
    const payload: MasterTableFieldInput = {
      key: draft.key,
      label: draft.label.trim(),
      field_type: draft.field_type,
      options: draft.field_type === 'select' ? options : [],
      required: draft.required,
      hidden: draft.hidden,
    }
    const ok =
      editing === 'new'
        ? await run(() => onCreate({ ...payload, order: customFields.length }), `'${payload.label}' added.`)
        : await run(() => onUpdate(editing as number, payload), `'${payload.label}' saved.`)
    if (ok) {
      setEditing(null)
      setDraft(emptyDraft)
    }
  }

  const form = (
    <div className="space-y-3 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] p-3">
      <p className="text-xs font-semibold text-[var(--color-ink)]">{editing === 'new' ? 'Add Field' : 'Edit Field'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Label</label>
          <input
            autoFocus
            value={draft.label}
            onChange={(e) =>
              setDraft((d) => ({ ...d, label: e.target.value, key: d.keyEdited || editing !== 'new' ? d.key : fieldKeyFromLabel(e.target.value) }))
            }
            className={inputClass}
            placeholder="e.g. Coating Type"
          />
        </div>
        <div>
          <label className={labelClass}>Key</label>
          <input
            value={draft.key}
            disabled={editing !== 'new'}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value, keyEdited: true }))}
            className={clsx(inputClass, 'font-mono disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-faint)]')}
          />
          {keyError && draft.key && <p className="mt-1 text-xs text-[var(--color-red)]">{keyError}</p>}
        </div>
      </div>
      <div>
        <label className={labelClass}>Type</label>
        <div className="flex gap-2">
          {(['text', 'number'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!!typeLockedReason}
              onClick={() => setDraft((d) => ({ ...d, field_type: t }))}
              className={clsx(
                'flex-1 rounded-md border px-3 py-1.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-50',
                draft.field_type === t ? 'border-[var(--color-blue)] bg-[var(--color-surface-alt)] text-[var(--color-blue)]' : 'border-[var(--color-border)] bg-[var(--color-surface-alt)]',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {typeLockedReason && <p className="mt-1 text-xs text-[var(--color-ink-faint)]">{typeLockedReason}</p>}
      </div>
      {draft.field_type === 'select' && (
        <div>
          <label className={labelClass}>Options (comma-separated)</label>
          <input value={draft.optionsText} onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))} className={inputClass} placeholder="Option A, Option B" />
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.required} onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))} />
          Required for new records
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.hidden} onChange={(e) => setDraft((d) => ({ ...d, hidden: e.target.checked }))} />
          Hidden
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(null)
            setDraft(emptyDraft)
          }}
        >
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={saveDraft} disabled={!canSaveDraft || saving}>
          {editing === 'new' ? 'Add Field' : 'Save'}
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Manage Fields — ${tableTitle}`} width="max-w-2xl" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-[var(--color-ink-faint)]">Fields you added</h3>
              {editing === null && (
                <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setEditing('new')}>
                  Add Field
                </Button>
              )}
            </div>
            {editing !== null && form}
            {customFields.length === 0 && editing === null && (
              <p className="text-sm text-[var(--color-ink-faint)]">None yet. Use "Add Field" to add a column to this table.</p>
            )}
            {customFields.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-2 font-mono text-xs text-[var(--color-ink-faint)]">{f.key}</span>
                  <span className="ml-2 text-xs capitalize text-[var(--color-ink-soft)]">
                    {f.field_type}
                    {f.required && ' · required'}
                    {f.hidden && ' · hidden'}
                  </span>
                </div>
                <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => startEdit(f)} disabled={editing !== null}>
                  Edit
                </Button>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-[var(--color-ink-faint)]">Built-in fields</h3>
            <p className="text-xs text-[var(--color-ink-faint)]">
              Pricing calculations read these by name, so they can be renamed or hidden but not deleted. Required fields can't be hidden.
            </p>
            {builtinColumns.map((c) => (
              <BuiltinRow
                key={c.key}
                column={c}
                override={overrides.get(c.key)}
                onSave={(label, hidden) => {
                  const o = overrides.get(c.key)
                  return run(() => (o ? onUpdate(o.id, { key: c.key, label, hidden }) : onCreate({ key: c.key, label, hidden })), `'${label}' saved.`)
                }}
                onReset={() => {
                  const o = overrides.get(c.key)
                  return o ? run(() => onDelete(o.id), `'${c.header}' restored.`) : Promise.resolve(true)
                }}
              />
            ))}
          </section>
        </div>
      </Modal>
    </>
  )
}

function BuiltinRow({
  column,
  override,
  onSave,
  onReset,
}: {
  column: BuiltinColumnInfo
  override?: MasterTableFieldDto
  onSave: (label: string, hidden: boolean) => Promise<boolean>
  onReset: () => Promise<boolean>
}) {
  const savedLabel = override?.label ?? column.header
  const savedHidden = override?.hidden ?? false
  const [label, setLabel] = useState(savedLabel)
  const [hidden, setHidden] = useState(savedHidden)
  const [synced, setSynced] = useState({ savedLabel, savedHidden })
  if (synced.savedLabel !== savedLabel || synced.savedHidden !== savedHidden) {
    setSynced({ savedLabel, savedHidden })
    setLabel(savedLabel)
    setHidden(savedHidden)
  }
  const dirty = label.trim() !== savedLabel || hidden !== savedHidden

  return (
    <div className={clsx('flex items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm', dirty && 'bg-[var(--color-amber-50)]')}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} className={clsx(inputClass, 'flex-1')} aria-label={`Label for ${column.key}`} />
      <span className="hidden w-40 truncate font-mono text-xs text-[var(--color-ink-faint)] sm:inline">{column.key}</span>
      <label className={clsx('flex items-center gap-1.5 whitespace-nowrap text-xs', column.required && 'opacity-50')} title={column.required ? 'Required — can\'t be hidden' : undefined}>
        <input type="checkbox" checked={hidden} disabled={column.required} onChange={(e) => setHidden(e.target.checked)} />
        Hidden
      </label>
      {dirty ? (
        <Button size="sm" variant="primary" disabled={!label.trim()} onClick={() => onSave(label.trim(), hidden)}>
          Save
        </Button>
      ) : override ? (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={onReset} title={`Back to '${column.header}', visible`}>
          Reset
        </Button>
      ) : (
        <span className="w-[62px]" />
      )}
    </div>
  )
}
