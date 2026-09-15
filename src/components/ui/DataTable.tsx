import type { ReactNode } from 'react'
import clsx from 'clsx'
import { EmptyState } from '@/components/EmptyState'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  keyField: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  loading,
  emptyTitle = 'No records found',
  emptyDescription = 'Try changing your filters.',
  emptyAction,
}: DataTableProps<T>) {
  if (loading) return <LoadingSkeleton rows={6} />
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyField(row)}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                'border-b border-[var(--color-border)] last:border-0',
                onRowClick && 'cursor-pointer hover:bg-[var(--color-blue-50)]/40',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    'px-3 py-2.5 align-middle text-[var(--color-ink)]',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
