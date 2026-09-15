import clsx from 'clsx'
import type { PulleyTechDataValues } from '@/types'
import { TECH_DATA_SECTIONS, getOptionsForField, type TechDataField } from '@/data/pulleyTechDataSchema'
import { Badge } from '@/components/ui/Badge'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

export function PulleyTechDataForm({
  values,
  onChange,
}: {
  values: PulleyTechDataValues
  onChange: (fieldKey: string, value: string | number) => void
}) {
  return (
    <div className="space-y-5">
      {TECH_DATA_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]">
            {section.title}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">
                  {field.label}
                  {field.unit && <span className="ml-1 text-[var(--color-ink-faint)]">({field.unit})</span>}
                  {field.auto && (
                    <Badge tone="blue" className="ml-1.5">
                      Auto
                    </Badge>
                  )}
                </label>
                <FieldInput field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}
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
