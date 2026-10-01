import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/apiClient'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'

const selectClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-faint)]'

export interface DropdownFieldDto {
  table: string
  label: string
  field: string
}

/** Accepts either a bare string list or a list of objects (various common key
 * names) — the dropdown-values endpoint's exact item shape isn't pinned down
 * anywhere the frontend can check, so this normalizes defensively instead of
 * assuming one specific shape. */
function normalizeDropdownValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return item
      if (typeof item === 'number') return String(item)
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const candidate = obj.value ?? obj.label ?? obj.name ?? obj.designation ?? obj.model_size ?? obj.id
        return candidate != null ? String(candidate) : ''
      }
      return ''
    })
    .filter(Boolean)
}

/**
 * Two-level dependent dropdown over the reference catalog APIs: pick which
 * catalog (Bearings / Sleeves / Lag Data / LCD Data / Housings — whatever
 * `/reference/catalogs/dropdown-fields/` returns, never hardcoded here), then
 * browse that catalog's actual values from `/reference/catalogs/dropdown-values/`.
 * `onImport` bulk-copies every fetched value in one action — the caller decides
 * what "import" means (e.g. filling in a comma-separated Options field).
 */
export function ReferenceCatalogPicker({ onImport }: { onImport: (values: string[]) => void }) {
  const pushToast = useUiStore((s) => s.pushToast)
  const [fields, setFields] = useState<DropdownFieldDto[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [valuesLoading, setValuesLoading] = useState(false)
  const [valuesLoadedOnce, setValuesLoadedOnce] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    setFieldsLoading(true)
    api
      .get<DropdownFieldDto[]>('/reference/catalogs/dropdown-fields/')
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .catch((err) => {
        if (!cancelled) pushToast(err instanceof ApiError ? err.message : 'Failed to load reference fields.', 'error')
      })
      .finally(() => {
        if (!cancelled) setFieldsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = fields.find((f) => `${f.table}::${f.field}` === selectedKey) ?? null

  const handleSelectField = (key: string) => {
    setSelectedKey(key)
    setValues([])
    setValuesLoadedOnce(false)
    const field = fields.find((f) => `${f.table}::${f.field}` === key)
    if (!field) return

    const requestId = ++requestIdRef.current
    setValuesLoading(true)
    api
      .get<unknown>(`/reference/catalogs/dropdown-values/?table=${encodeURIComponent(field.table)}&field=${encodeURIComponent(field.field)}`)
      .then((data) => {
        if (requestId !== requestIdRef.current) return // a newer selection has since superseded this response
        setValues(normalizeDropdownValues(data))
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        pushToast(err instanceof ApiError ? err.message : 'Failed to load reference values.', 'error')
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setValuesLoading(false)
        setValuesLoadedOnce(true)
      })
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-medium text-[var(--color-ink-soft)]">Import options from a reference catalog</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Field</label>
          <select value={selectedKey} onChange={(e) => handleSelectField(e.target.value)} disabled={fieldsLoading} className={selectClass}>
            <option value="">{fieldsLoading ? 'Loading...' : 'Select Reference Field...'}</option>
            {fields.map((f) => (
              <option key={`${f.table}::${f.field}`} value={`${f.table}::${f.field}`}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Value</label>
          <select disabled={!selected || valuesLoading || values.length === 0} className={selectClass} defaultValue="">
            <option value="">
              {!selected
                ? 'Select a Reference Field first'
                : valuesLoading
                  ? 'Loading...'
                  : values.length === 0
                    ? 'No records found'
                    : `${values.length} record${values.length === 1 ? '' : 's'} found`}
            </option>
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={values.length === 0}
          icon={valuesLoading ? <Loader2 size={12} className="animate-spin" /> : undefined}
          onClick={() => onImport(values)}
        >
          Use these {values.length || ''} value{values.length === 1 ? '' : 's'} as Options
        </Button>
        {selected && valuesLoadedOnce && values.length === 0 && !valuesLoading && (
          <span className="text-xs text-[var(--color-ink-faint)]">This catalog has no records yet.</span>
        )}
      </div>
    </div>
  )
}
