import { useState } from 'react'
import clsx from 'clsx'
import type { PulleyTechDataValues, TechDataFieldOverride, TechDataFieldOverrides } from '@/types'
import { useTechDataSections, getOptionsForField, type FieldType, type TechDataField } from '@/data/pulleyTechDataSchema'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ReferenceCatalogPicker } from '@/components/reference/ReferenceCatalogPicker'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

export function PulleyTechDataForm({
  values,
  onChange,
  fieldOverrides,
  onFieldOverrideChange,
}: {
  values: PulleyTechDataValues
  onChange: (fieldKey: string, value: string | number) => void
  /** This item's per-RFQ field type changes, applied on top of the global sheet. */
  fieldOverrides?: TechDataFieldOverrides
  /** Pass only for roles allowed to change a field's type for this RFQ (Controlling/Admin);
   * `null` resets the field back to its global type. */
  onFieldOverrideChange?: (fieldKey: string, override: TechDataFieldOverride | null) => void
}) {
  const techDataSections = useTechDataSections(fieldOverrides)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  return (
    <div className="space-y-5">
      {techDataSections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]">
            {section.title}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {section.fields.map((field) => {
              const isOverridden = !!fieldOverrides?.[field.key]
              const isEditing = editingKey === field.key
              return (
                <div key={field.key} className={clsx(isEditing && 'sm:col-span-2')}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-[var(--color-ink-soft)]">
                      {field.label}
                      {field.unit && <span className="ml-1 text-[var(--color-ink-faint)]">({field.unit})</span>}
                      {field.auto && (
                        <Badge tone="blue" className="ml-1.5">
                          Auto
                        </Badge>
                      )}
                      {isOverridden && (
                        <span title="Type changed for this RFQ only">
                          <Badge tone="amber" className="ml-1.5">
                            {field.type} · this RFQ
                          </Badge>
                        </span>
                      )}
                    </label>
                    {onFieldOverrideChange && !field.auto && !isEditing && (
                      <button
                        type="button"
                        onClick={() => setEditingKey(field.key)}
                        className="shrink-0 text-xs text-[var(--color-blue)] hover:underline"
                      >
                        Change type
                      </button>
                    )}
                  </div>
                  {isEditing && onFieldOverrideChange ? (
                    <FieldTypeEditor
                      field={field}
                      isOverridden={isOverridden}
                      onCancel={() => setEditingKey(null)}
                      onApply={(override) => {
                        onFieldOverrideChange(field.key, override)
                        setEditingKey(null)
                      }}
                    />
                  ) : (
                    <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Inline editor for changing one field's type on this RFQ item only. */
function FieldTypeEditor({
  field,
  isOverridden,
  onCancel,
  onApply,
}: {
  field: TechDataField
  isOverridden: boolean
  onCancel: () => void
  onApply: (override: TechDataFieldOverride | null) => void
}) {
  const [fieldType, setFieldType] = useState<FieldType>(field.type)
  const [optionsText, setOptionsText] = useState((field.options ?? (field.type === 'select' ? getOptionsForField(field.key) : [])).join(', '))
  const options = optionsText.split(',').map((o) => o.trim()).filter(Boolean)
  const canApply = fieldType !== 'select' || options.length > 0

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-amber)] bg-[var(--color-amber-50)] p-3">
      <p className="text-xs text-[var(--color-ink-soft)]">Changes the type for this RFQ only. Other RFQs keep the type set on the Formulas page.</p>
      <div className="flex gap-2">
        {(['text', 'number', 'select'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFieldType(t)}
            className={clsx(
              'flex-1 rounded-md border px-3 py-1.5 text-sm capitalize',
              fieldType === t
                ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-alt)]',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {fieldType === 'select' && (
        <>
          <ReferenceCatalogPicker onImport={(values) => setOptionsText(values.join(', '))} />
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Options (comma-separated)</label>
            <input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className={clsx(inputClass, 'bg-[var(--color-surface-alt)]')} />
            {options.length === 0 && <p className="mt-1 text-xs text-[var(--color-red)]">Add at least one option (or import from a catalog above).</p>}
          </div>
        </>
      )}
      <div className="flex justify-between gap-2">
        <div>
          {isOverridden && (
            <Button variant="ghost" onClick={() => onApply(null)}>
              Reset to default type
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canApply} onClick={() => onApply({ fieldType, options: fieldType === 'select' ? options : [] })}>
            Apply to this RFQ
          </Button>
        </div>
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TechDataField
  value: string | number | undefined
  onChange: (value: string | number) => void
}) {
  if (field.auto) {
    return (
      <input
        value={value === undefined || value === '' ? '—' : String(value)}
        readOnly
        className={clsx(inputClass, 'cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-ink-soft)]')}
      />
    )
  }

  if (field.type === 'select') {
    const options = field.options ?? getOptionsForField(field.key)
    return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={value === undefined ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={inputClass}
      />
    )
  }

  return <input type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputClass} />
}

export function isTechDataFilled(values: PulleyTechDataValues | undefined): boolean {
  if (!values) return false
  return Object.entries(values).some(([, v]) => v !== undefined && v !== '')
}
