import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, ApiError } from '@/lib/apiClient'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'

const selectClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-ink-faint)]'

export interface DropdownValueFieldDto {
  field: string
  label: string
}

export interface DropdownTableDto {
  table: string
  label: string
  /** The column Reference Value always browses by (e.g. Designation, Lagging Type) —
   * fixed per table, never user-chosen, so you're always picking a real record by its
   * natural name regardless of which value field is selected. */
  labelField: DropdownValueFieldDto
  /** Other columns on the same row that can be pulled instead of the label itself
   * (e.g. a bearing's INR/EUR price) — this is what "Price Field" offers. Empty when
   * a table has nothing beyond its label worth pulling. */
  valueFields: DropdownValueFieldDto[]
}

export interface DropdownReferenceFieldDto {
  referenceField: string
  label: string
  tables: DropdownTableDto[]
}

export interface CatalogRow {
  label: string
  value: string
}
type Row = CatalogRow

/** What the picker currently points at, reported in `onCatalogChange` mode: the
 * "table::label_field::value_field" prefix of an options_source key, and every row. */
export interface CatalogSelection {
  sourcePrefix: string
  rows: CatalogRow[]
}

/** Accepts the target `{label, value}` shape, but also falls back gracefully for a
 * plain string/number list or a `{value}`-only object — the exact backend shape may
 * still be migrating through these. */
function normalizeRows(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return []
  const rows: Row[] = []
  for (const item of raw) {
    if (typeof item === 'string' || typeof item === 'number') {
      rows.push({ label: String(item), value: String(item) })
      continue
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      const label = obj.label ?? obj.value ?? obj.name ?? obj.designation ?? obj.model_size ?? obj.id
      if (label == null) continue
      const value = obj.value ?? label
      rows.push({ label: String(label), value: String(value) })
    }
  }
  return rows
}

/**
 * Progressive dependent picker over the reference catalog APIs:
 *   Reference Field (e.g. "Bearing Data")
 *     -> Table        (only shown when there's more than one, e.g. Raw Forging's Shaft/Shell)
 *       -> Reference Value   (always browses the table's natural label column — e.g.
 *                              Designation — regardless of Price Field below)
 *       -> Price Field  (only shown when the table has extra columns worth pulling,
 *                         e.g. a bearing's INR/EUR price — picks what actually gets
 *                         used instead of the label text)
 * Reference Value's options never change when Price Field changes — you're always
 * browsing real records by name; Price Field just decides what value comes out the
 * other end for the record you land on (or for all of them, on Import).
 * Nothing here is hardcoded — every level's options come straight from
 * `/reference/catalogs/dropdown-fields/`.
 */
export function ReferenceCatalogPicker({
  onImport,
  onPickValue,
  sourceKey,
  onSourceChange,
  pickedValue: controlledPickedValue,
  onCatalogChange,
  pickedLabel,
  onPickLabel,
}: {
  /** Every row's resolved value (the price, if Price Field is set — otherwise the label). */
  onImport?: (values: string[]) => void
  /** Called when one Reference Value is picked, with every row's resolved value — lets
   * the caller use it as the field's fixed value. Without it the value list is browse-only. */
  onPickValue?: (value: string, allValues: string[]) => void
  /** The saved "table::labelField::valueField::label" to preselect, so reopening shows it again. */
  sourceKey?: string
  onSourceChange?: (key: string) => void
  /** The saved resolved value to show as picked (e.g. the field's fixed value). */
  pickedValue?: string
  /** Rows-only mode: the picker stops at Reference Field -> Table -> Price Field and
   * hands every loaded row to the caller (which lets the user pick one elsewhere, e.g.
   * a Fixed value dropdown). Hides Reference Value and the "Use these values" button.
   * Called with null once the user clears the selection. */
  onCatalogChange?: (selection: CatalogSelection | null) => void
  /** Rows-only mode: the row label currently picked by the caller (its Fixed value),
   * shown in the record dropdown (Designation, Sleeve Code, ...). */
  pickedLabel?: string
  /** Rows-only mode: a record was picked in the record dropdown ('' = cleared). */
  onPickLabel?: (label: string) => void
}) {
  const rowsOnly = !!onCatalogChange
  const pushToast = useUiStore((s) => s.pushToast)
  const [referenceFields, setReferenceFields] = useState<DropdownReferenceFieldDto[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(true)

  const [selectedReferenceField, setSelectedReferenceField] = useState('')
  const [selectedTable, setSelectedTable] = useState('')
  const [selectedPriceField, setSelectedPriceField] = useState('') // '' = use the label itself
  const [selectedLabel, setSelectedLabel] = useState('')

  const [rows, setRows] = useState<Row[]>([])
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsLoadedOnce, setRowsLoadedOnce] = useState(false)
  const requestIdRef = useRef(0)
  const rowsLoadFailedRef = useRef(false)

  const referenceFieldObj = referenceFields.find((r) => r.referenceField === selectedReferenceField) ?? null
  const tables = referenceFieldObj?.tables ?? []
  const tableObj = tables.find((t) => t.table === selectedTable) ?? null
  const valueFields = tableObj?.valueFields ?? []
  const showTablePicker = tables.length > 1
  const showPriceFieldPicker = valueFields.length > 0

  // The resolved value for whichever label is currently picked (undefined until rows load).
  const resolvedValue = rows.find((r) => r.label === selectedLabel)?.value

  // Keeps the external Fixed Value in sync whenever the already-picked record's
  // resolved value changes — i.e. after switching Price Field, since that reloads
  // `rows` under the same selectedLabel with a different column's value.
  useEffect(() => {
    if (!selectedLabel) return
    const row = rows.find((r) => r.label === selectedLabel)
    if (row) onPickValue?.(row.value, rows.map((r) => r.value))
    // onPickValue intentionally excluded — callers typically pass a fresh inline
    // function each render, which would otherwise refire this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedLabel])

  // Rows-only mode: report each freshly loaded row set (a new table or Price Field).
  // Not while loading, and not after a failed load, so a transient error never wipes
  // the caller's pick.
  useEffect(() => {
    if (!onCatalogChange || !tableObj || !rowsLoadedOnce || rowsLoadFailedRef.current) return
    onCatalogChange({ sourcePrefix: `${tableObj.table}::${tableObj.labelField.field}::${selectedPriceField}`, rows })
    // onCatalogChange excluded for the same reason as onPickValue above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowsLoadedOnce])

  useEffect(() => {
    let cancelled = false
    setFieldsLoading(true)
    api
      .get<DropdownReferenceFieldDto[]>('/reference/catalogs/dropdown-fields/')
      .then((data) => {
        if (cancelled) return
        setReferenceFields(data)
        if (sourceKey) restoreSelection(sourceKey, data)
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

  function restoreSelection(key: string, data: DropdownReferenceFieldDto[]) {
    const [table, labelField, valueField, encodedLabel] = key.split('::')
    for (const rf of data) {
      const t = rf.tables.find((x) => x.table === table && x.labelField.field === labelField)
      if (t) {
        setSelectedReferenceField(rf.referenceField)
        setSelectedTable(table)
        setSelectedPriceField(valueField ?? '')
        setSelectedLabel(encodedLabel ? decodeURIComponent(encodedLabel) : '')
        loadRows(table, labelField, valueField ?? '')
        return
      }
    }
  }

  const handleSelectReferenceField = (referenceField: string) => {
    setSelectedReferenceField(referenceField)
    resetBelowReferenceField()
    const rf = referenceFields.find((r) => r.referenceField === referenceField)
    // Only one table under this reference field? Skip the Table dropdown entirely.
    if (rf?.tables.length === 1) selectTable(rf.tables[0])
  }

  const handleSelectTable = (table: string) => {
    const t = tables.find((x) => x.table === table)
    if (t) selectTable(t)
  }

  function selectTable(t: DropdownTableDto) {
    setSelectedTable(t.table)
    setSelectedPriceField('')
    setSelectedLabel('')
    setRows([])
    setRowsLoadedOnce(false)
    onSourceChange?.('')
    loadRows(t.table, t.labelField.field, '')
  }

  const handleSelectPriceField = (field: string) => {
    setSelectedPriceField(field)
    // Deliberately NOT clearing selectedLabel — switching Price Field re-resolves the
    // same already-picked record against the new column instead of forgetting it;
    // see the effect below that re-fires onPickValue once the new rows land.
    if (tableObj) {
      loadRows(tableObj.table, tableObj.labelField.field, field)
      if (selectedLabel) onSourceChange?.(`${tableObj.table}::${tableObj.labelField.field}::${field}::${encodeURIComponent(selectedLabel)}`)
    }
  }

  const handlePickLabel = (label: string) => {
    setSelectedLabel(label)
    if (!label) {
      onSourceChange?.('')
      return
    }
    if (tableObj) {
      onSourceChange?.(`${tableObj.table}::${tableObj.labelField.field}::${selectedPriceField}::${encodeURIComponent(label)}`)
    }
    const row = rows.find((r) => r.label === label)
    if (row) onPickValue?.(row.value, rows.map((r) => r.value))
  }

  function resetBelowReferenceField() {
    setSelectedTable('')
    setSelectedPriceField('')
    setSelectedLabel('')
    setRows([])
    setRowsLoadedOnce(false)
    onSourceChange?.('')
    onCatalogChange?.(null)
  }

  function loadRows(table: string, labelField: string, valueField: string) {
    setRows([])
    setRowsLoadedOnce(false)
    rowsLoadFailedRef.current = false
    if (!table || !labelField) return

    const requestId = ++requestIdRef.current
    setRowsLoading(true)
    const valueParam = valueField ? `&value_field=${encodeURIComponent(valueField)}` : ''
    api
      .get<unknown>(`/reference/catalogs/dropdown-values/?table=${encodeURIComponent(table)}&label_field=${encodeURIComponent(labelField)}${valueParam}`)
      .then((data) => {
        if (requestId !== requestIdRef.current) return // a newer selection has since superseded this response
        setRows(normalizeRows(data))
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        rowsLoadFailedRef.current = true
        pushToast(err instanceof ApiError ? err.message : 'Failed to load reference values.', 'error')
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setRowsLoading(false)
        setRowsLoadedOnce(true)
      })
  }

  const displayedLabel = selectedLabel || (controlledPickedValue && rows.find((r) => r.value === controlledPickedValue)?.label) || ''

  const priceFieldSelect = (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Price Field</label>
      <select value={selectedPriceField} onChange={(e) => handleSelectPriceField(e.target.value)} className={selectClass}>
        <option value="">{tableObj?.labelField.label ?? 'Label'} itself</option>
        {valueFields.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )

  if (rowsOnly) {
    // The table's record column (Designation, Sleeve Code, Lagging Type, ...): picking a
    // record here makes it the caller's Fixed value, and vice versa.
    const uniqueLabels = [...new Set(rows.map((r) => r.label))]
    const recordSelect = (
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">{tableObj?.labelField.label ?? 'Reference Value'}</label>
        <select
          value={pickedLabel && uniqueLabels.includes(pickedLabel) ? pickedLabel : ''}
          onChange={(e) => onPickLabel?.(e.target.value)}
          disabled={!tableObj || rowsLoading || rows.length === 0}
          className={selectClass}
        >
          <option value="">
            {!tableObj
              ? showTablePicker
                ? 'Select a Table first'
                : 'Select a Reference Field first'
              : rowsLoading
                ? 'Loading...'
                : rows.length === 0
                  ? 'No records found'
                  : 'Select...'}
          </option>
          {uniqueLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
    )

    return (
      <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs font-medium text-[var(--color-ink-soft)]">Values from a master data table</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Field</label>
            <select
              value={selectedReferenceField}
              onChange={(e) => handleSelectReferenceField(e.target.value)}
              disabled={fieldsLoading}
              className={selectClass}
            >
              <option value="">{fieldsLoading ? 'Loading...' : 'Select Reference Field...'}</option>
              {referenceFields.map((rf) => (
                <option key={rf.referenceField} value={rf.referenceField}>
                  {rf.label}
                </option>
              ))}
            </select>
          </div>
          {showTablePicker && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Table</label>
              <select value={selectedTable} onChange={(e) => handleSelectTable(e.target.value)} className={selectClass}>
                <option value="">Select Table...</option>
                {tables.map((t) => (
                  <option key={t.table} value={t.table}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {recordSelect}
          {showPriceFieldPicker && priceFieldSelect}
        </div>
        {tableObj && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
            {rowsLoading ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Loading values...
              </>
            ) : rowsLoadedOnce && rows.length === 0 ? (
              'This table has no records yet.'
            ) : rowsLoadedOnce ? (
              `${rows.length} record${rows.length === 1 ? '' : 's'} loaded. Pick a ${tableObj.labelField.label} and Price Field above (or under Fixed value below), or leave it for Sales to pick on each RFQ.`
            ) : null}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-medium text-[var(--color-ink-soft)]">Import options from a reference catalog</p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Field</label>
          <select
            value={selectedReferenceField}
            onChange={(e) => handleSelectReferenceField(e.target.value)}
            disabled={fieldsLoading}
            className={selectClass}
          >
            <option value="">{fieldsLoading ? 'Loading...' : 'Select Reference Field...'}</option>
            {referenceFields.map((rf) => (
              <option key={rf.referenceField} value={rf.referenceField}>
                {rf.label}
              </option>
            ))}
          </select>
        </div>

        {showTablePicker ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Table</label>
            <select value={selectedTable} onChange={(e) => handleSelectTable(e.target.value)} className={selectClass}>
              <option value="">Select Table...</option>
              {tables.map((t) => (
                <option key={t.table} value={t.table}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Value</label>
            <select
              disabled={!tableObj || rowsLoading || rows.length === 0 || !!selectedPriceField}
              className={selectClass}
              value={displayedLabel}
              onChange={(e) => handlePickLabel(e.target.value)}
            >
              <option value="">
                {!tableObj
                  ? 'Select a Reference Field first'
                  : selectedPriceField
                    ? 'Only available when Price Field is the label itself'
                    : rowsLoading
                      ? 'Loading...'
                      : rows.length === 0
                        ? 'No records found'
                        : 'Select...'}
              </option>
              {rows.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showTablePicker && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Reference Value</label>
            <select
              disabled={!tableObj || rowsLoading || rows.length === 0 || !!selectedPriceField}
              className={selectClass}
              value={displayedLabel}
              onChange={(e) => handlePickLabel(e.target.value)}
            >
              <option value="">
                {!tableObj
                  ? 'Select a Table first'
                  : selectedPriceField
                    ? 'Only available when Price Field is the label itself'
                    : rowsLoading
                      ? 'Loading...'
                      : rows.length === 0
                        ? 'No records found'
                        : 'Select...'}
              </option>
              {rows.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {showPriceFieldPicker && (
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-soft)]">
                Price Field
              </label>
              <select value={selectedPriceField} onChange={(e) => handleSelectPriceField(e.target.value)} className={selectClass}>
                <option value="">{tableObj?.labelField.label ?? 'Label'} itself</option>
                {valueFields.map((f) => (
                  <option key={f.field} value={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {!showTablePicker && showPriceFieldPicker && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Price Field</label>
          <select value={selectedPriceField} onChange={(e) => handleSelectPriceField(e.target.value)} className={selectClass}>
            <option value="">{tableObj?.labelField.label ?? 'Label'} itself</option>
            {valueFields.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={rows.length === 0}
          icon={rowsLoading ? <Loader2 size={12} className="animate-spin" /> : undefined}
          onClick={() => onImport?.(rows.map((r) => r.value))}
        >
          Use these {rows.length || ''} value{rows.length === 1 ? '' : 's'} as Options
        </Button>
        {tableObj && rowsLoadedOnce && rows.length === 0 && !rowsLoading && (
          <span className="text-xs text-[var(--color-ink-faint)]">This table has no records yet.</span>
        )}
      </div>

      {selectedLabel && resolvedValue !== undefined && (
        <p className="text-xs text-[var(--color-ink-faint)]">
          <strong>{selectedLabel}</strong> → <strong className="text-[var(--color-blue)]">{resolvedValue}</strong>
        </p>
      )}
    </div>
  )
}
