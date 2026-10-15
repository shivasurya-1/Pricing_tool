import type { PulleyTechDataValues } from '@/types'
import { useTechDataSections } from '@/data/pulleyTechDataSchema'

/** Read-only, sectioned display of a captured Technical Data Sheet — for review
 * screens (Operations, Sourcing, Controlling, Approval) where a team needs to see
 * the full spec before making a call, not edit it. */
export function PulleyTechDataView({ values }: { values: PulleyTechDataValues | undefined }) {
  const techDataSections = useTechDataSections()
  if (!values) return <p className="text-sm text-[var(--color-ink-faint)]">No technical data captured for this item.</p>

  const sectionsWithData = techDataSections.map((section) => ({
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
          <div className="flex gap-4 px-0.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
            <span className="flex-1">Parameter</span>
            <span className="w-40 text-right">Value</span>
          </div>
          <div>
            {section.fields.map((field) => (
              <div key={field.key} className="flex gap-4 border-b border-dashed border-[var(--color-border)] py-1.5 text-sm">
                <span className="flex-1 text-[var(--color-ink-faint)]">{field.label}</span>
                <span className="w-40 text-right font-medium text-[var(--color-ink)]">
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
