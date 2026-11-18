import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'

/**
 * User-managed fields on a master-data table ("Manage Fields" / "Add Field"), backed by
 * /reference/table-fields/ (backend: reference/custom_fields.py). A table is named by
 * its backend slug, e.g. "shell-bands".
 *
 * - A user-added field (`is_builtin: false`) stores its values in each record's
 *   `extra[key]`; it can be edited and deleted.
 * - A built-in override (`is_builtin: true`, key = a column name) only renames or
 *   hides that column; pricing code reads built-in columns by name, so they're never
 *   deleted. Deleting the override restores the default.
 */

export type MasterFieldType = 'text' | 'number' | 'select'

export interface MasterTableFieldDto {
  id: number
  table: string
  key: string
  label: string
  field_type: MasterFieldType
  options: string[]
  required: boolean
  is_builtin: boolean
  hidden: boolean
  order: number
}

export type MasterTableFieldInput = Partial<Omit<MasterTableFieldDto, 'id' | 'table' | 'is_builtin'>> & { key: string; label: string }

export type ExtraValues = Record<string, string | number | null>

/** Column keys of user-added fields in ReferenceCrudTable are "extra.<key>". */
export const EXTRA_PREFIX = 'extra.'

export function isExtraKey(columnKey: string): boolean {
  return columnKey.startsWith(EXTRA_PREFIX)
}

/** A cell's value, reading "extra.<key>" columns from the record's `extra`. */
export function cellValue(row: unknown, columnKey: string): unknown {
  const record = row as Record<string, unknown>
  if (isExtraKey(columnKey)) {
    const extra = record.extra as ExtraValues | undefined
    return extra?.[columnKey.slice(EXTRA_PREFIX.length)]
  }
  return record[columnKey]
}

/** Splits form values keyed by column into built-in values plus an `extra` object for
 * the user-added fields (blank -> null), the shape the master-data APIs accept. */
export function splitExtraValues(values: Record<string, string | number>): Record<string, string | number> {
  const builtin: Record<string, unknown> = {}
  const extra: ExtraValues = {}
  for (const [key, value] of Object.entries(values)) {
    if (isExtraKey(key)) extra[key.slice(EXTRA_PREFIX.length)] = value === '' ? null : value
    else builtin[key] = value
  }
  if (Object.keys(extra).length > 0) builtin.extra = extra
  // `extra` is an object, not string | number — kept under the existing callback type so
  // every page's onCreate/onUpdate signature stays as it is; see extraOf().
  return builtin as Record<string, string | number>
}

/** For a page's onCreate: forwards the `extra` values ReferenceCrudTable put on the form
 * values into the create payload — `createShellBand({ ..., ...extraOf(v) })`. Typed as
 * `object` so it spreads into any DTO-typed input without widening it. */
export function extraOf(values: Record<string, unknown>): object {
  return values.extra && typeof values.extra === 'object' ? { extra: values.extra } : {}
}

/** "Coating Type" -> "coating_type" (the backend's key format). */
export function fieldKeyFromLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(slug) ? slug.slice(0, 60) : slug ? `f_${slug}`.slice(0, 60) : ''
}

/** Per field (built-in column name, or "extra.<key>" for an added field): its own type,
 * its current type, and why the type can't change — null when it can. The backend only
 * allows a type change while the field has no data (no record value, no Formulas link). */
export interface FieldTypeInfo {
  natural_type: MasterFieldType
  type: MasterFieldType
  locked_reason: string | null
}

export function useMasterTableFields(table?: string) {
  const [fields, setFields] = useState<MasterTableFieldDto[]>([])
  const [typeInfo, setTypeInfo] = useState<Record<string, FieldTypeInfo>>({})

  const reload = useCallback(async () => {
    if (!table) return
    const q = `?table=${encodeURIComponent(table)}`
    const [list, info] = await Promise.all([
      api.get<MasterTableFieldDto[]>(`/reference/table-fields/${q}`),
      api.get<Record<string, FieldTypeInfo>>(`/reference/table-fields/type-info/${q}`).catch(() => ({})),
    ])
    setFields(list)
    setTypeInfo(info)
  }, [table])

  useEffect(() => {
    // A failed load just leaves the table with its built-in columns.
    reload().catch(() => undefined)
  }, [reload])

  const create = async (input: MasterTableFieldInput) => {
    await api.post('/reference/table-fields/', { ...input, table })
    await reload()
  }
  const update = async (id: number, patch: Partial<MasterTableFieldInput>) => {
    await api.patch(`/reference/table-fields/${id}/`, patch)
    await reload()
  }
  const remove = async (id: number) => {
    await api.delete(`/reference/table-fields/${id}/`)
    await reload()
  }

  return { fields, typeInfo, create, update, remove, reload }
}
