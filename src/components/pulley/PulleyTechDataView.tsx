import type { PulleyTechDataValues } from '@/types'
import { TECH_DATA_SECTIONS } from '@/data/pulleyTechDataSchema'

/** Read-only, sectioned display of a captured Technical Data Sheet — for review
 * screens (Operations, Sourcing, Controlling, Approval) where a team needs to see
 * the full spec before making a call, not edit it. */
export function PulleyTechDataView({ values }: { values: PulleyTechDataValues | undefined }) {
  if (!values) return <p className="text-sm text-[var(--color-ink-faint)]">No technical data captured for this item.</p>

  const sectionsWithData = TECH_DATA_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields.filter((f) => {
      const v = values[f.key]
      return v !== undefined && v !== ''
    }),
  })).filter((s) => s.fields.length > 0)

  if (sectionsWithData.length === 0) {
    return <p className="text-sm text-[var(--color-ink-faint)]">No technical data captured for this item.</p>
  }

  return (
    <div className="space-y-4">
      {sectionsWithData.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]">
            {section.title}
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {section.fields.map((field) => (
              <div key={field.key} className="flex justify-between gap-2 border-b border-dashed border-[var(--color-border)] py-1 text-sm">
                <span className="text-[var(--color-ink-faint)]">{field.label}</span>
                <span className="text-right font-medium text-[var(--color-ink)]">
                  {values[field.key]}
                  {field.unit && <span className="ml-0.5 text-[var(--color-ink-faint)]">{field.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
