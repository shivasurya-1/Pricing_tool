import { Fragment } from 'react'
import type { PulleyTechDataValues } from '@/types'
import { useTechDataSections } from '@/data/pulleyTechDataSchema'

export interface TechDataCompareColumn {
  key: string
  label: string
  badge?: string
  values: PulleyTechDataValues | undefined
}

/** Read-only, side-by-side Technical Data Sheet comparison across every pulley on one
 * RFQ — fields as rows (grouped into their numbered sections), one column per pulley,
 * same spirit as the client's own Excel sheet. Use this instead of stacking each
 * pulley's PulleyTechDataView one after another, which forces scrolling all the way
 * down just to compare the same field across pulleys. */
export function PulleyTechDataCompareView({ columns }: { columns: TechDataCompareColumn[] }) {
  // Every section from the schema is shown, even one with no data entered yet for any
  // pulley on this RFQ (e.g. Locking Device & Dead Shaft Parts before anyone's filled
  // it in) — hiding it would make the section look like it doesn't exist at all,
  // rather than "not filled in yet".
  const sectionsWithFields = useTechDataSections().filter((s) => s.fields.length > 0)

  if (columns.length === 0 || sectionsWithFields.length === 0) {
    return <p className="text-sm text-[var(--color-ink-faint)]">No technical data captured for this RFQ's items.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[260px] border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
              Parameter
            </th>
            {columns.map((col) => (
              <th key={col.key} className="min-w-[160px] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left font-semibold text-[var(--color-ink)]">
                {col.label}
                {col.badge && <p className="text-xs font-normal text-[var(--color-ink-faint)]">{col.badge}</p>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sectionsWithFields.map((section) => (
            <Fragment key={section.title}>
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="sticky left-0 border-b border-t border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]"
                >
                  {section.title}
                </td>
              </tr>
              {section.fields.map((field) => (
                <tr key={field.key} className="border-b border-[var(--color-border)]">
                  <td className="sticky left-0 z-10 border-r border-[var(--color-border)] bg-white px-3 py-2 text-[var(--color-ink-faint)]">
                    {field.label}
                  </td>
                  {columns.map((col) => {
                    const v = col.values?.[field.key]
                    return (
                      <td key={col.key} className="px-3 py-2 text-right font-medium text-[var(--color-ink)]">
                        {v === undefined || v === '' ? (
                          <span className="text-[var(--color-ink-faint)]">—</span>
                        ) : (
                          <>
                            {v}
                            {field.unit && <span className="ml-0.5 text-[var(--color-ink-faint)]">{field.unit}</span>}
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
