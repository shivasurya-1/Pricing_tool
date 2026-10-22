import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore, type TechDataFieldDto } from '@/store/formulaStore'
import { useReferenceStore } from '@/store/referenceStore'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { computePulleyPricing, type CostLine, type PulleyPricingResult } from '@/lib/pulleyPricingCalc'
import { computeAutoFields } from '@/lib/pulleyTechDataCalc'
import { catalogDisplayValue, IN_HOUSE_OPERATIONS, PROCESS_SOURCING_MAP, useTechDataSections, type TechDataField } from '@/data/pulleyTechDataSchema'
import type { PulleyTechDataValues, RFQ, RFQItem } from '@/types'
import './PricingToolSheet.css'

// Section colours from the client's Pricing Tool reference (Pricing_Tool_Section5_Dropdowns.html).
const INPUT_COLORS: Record<number, string> = {
  1: '#475569',
  2: '#1D4ED8',
  3: '#0F766E',
  4: '#15803D',
  5: '#B45309',
  6: '#C2410C',
  7: '#7E22CE',
  8: '#BE185D',
}
const EXTRA_COLORS = ['#334155', '#0369A1', '#4D7C0F', '#9D174D']
const COST_SECTIONS: {
  code: 'A' | 'B' | 'C' | 'D' | 'E'
  title: string
  totalLabel: string
  lines: keyof Pick<PulleyPricingResult, 'sectionA' | 'sectionB' | 'sectionC' | 'sectionD' | 'sectionE'>
  total: keyof Pick<PulleyPricingResult, 'totalA' | 'totalB' | 'totalC' | 'totalD' | 'totalE'>
  color: string
}[] = [
  { code: 'A', title: 'Raw materials cost', totalLabel: 'TOTAL RAW MATERIALS COST (A)', lines: 'sectionA', total: 'totalA', color: '#B7791F' },
  { code: 'B', title: 'Ancillary parts cost', totalLabel: 'TOTAL ANCILLARY PARTS COST (B)', lines: 'sectionB', total: 'totalB', color: '#B83280' },
  { code: 'C', title: 'In-house processing cost', totalLabel: 'TOTAL IN-HOUSE PROCESSING COST (C)', lines: 'sectionC', total: 'totalC', color: '#2F855A' },
  { code: 'D', title: 'Outsourced processing cost', totalLabel: 'TOTAL OUTSOURCED PROCESSING COST (D)', lines: 'sectionD', total: 'totalD', color: '#6B46C1' },
  { code: 'E', title: 'Packing & shipment cost', totalLabel: 'TOTAL PACKING & SHIPMENT COST (E)', lines: 'sectionE', total: 'totalE', color: '#0E7490' },
]
const SECTION_F_COLOR = '#1E3A8A'
const PRICING_FIELD_COLORS = ['#475569', '#9A3412', '#3F6212']

// Section 5's catalog-driven components. The sleeve field is "sleeveCode" on the
// built-in schema but may be renamed (e.g. "adapterSleeveCode") on a customised sheet.
const SLEEVE_KEYS = ['sleeveCode', 'adapterSleeveCode']

type Values = PulleyTechDataValues
type ViewMode = 'all' | 'single'

/** Everything one pulley column needs. */
interface Column {
  item: RFQItem
  values: Values
  autoValues: Values
  pricing: PulleyPricingResult
}

/** Mixes `hex` with white — `amount` is the share of the colour (0.055 = 5.5%). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(255 - (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

function sectionStyle(hex: string): CSSProperties {
  return { '--c': hex, '--t1': tint(hex, 0.055), '--t2': tint(hex, 0.17) } as CSSProperties
}

/** Indian number format; whole numbers from 100 up, 2 decimals below (e.g. 2.45 m²). */
function fmtNumber(n: number, decimals?: number): string {
  const max = decimals ?? (Math.abs(n) >= 100 ? 0 : 2)
  return n.toLocaleString('en-IN', { maximumFractionDigits: max, minimumFractionDigits: decimals ?? 0 })
}

/** Empty -> "—", 0 -> "0", numbers (and numeric strings) in en-IN format, text as-is. */
function fmtValue(v: string | number | undefined | null): string {
  if (v === undefined || v === null || v === '') return '—'
  if (typeof v === 'number') return Number.isFinite(v) ? fmtNumber(v) : '—'
  const trimmed = v.trim()
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return fmtNumber(Number(trimmed))
  return trimmed
}

function fmtCost(line: CostLine | undefined): string {
  if (!line) return '—'
  return line.pending ? '—' : fmtNumber(line.value, 0)
}

/** "5.BEARINGS, HOUSINGS & SLEEVES" -> { code: 5, title: "Bearings, housings & sleeves" }. */
function parseSectionTitle(raw: string): { code: number | null; title: string } {
  const m = raw.match(/^\s*(\d+)\s*[.)]?\s*(.*)$/)
  const code = m ? Number(m[1]) : null
  const text = (m ? m[2] : raw).split('—')[0].trim()
  const sentence = text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text
  return { code, title: sentence }
}

function isTotalRow(field: TechDataField): boolean {
  return /^total\b/i.test(field.label) || /\bcost\b.*\[auto\]/i.test(field.label)
}

/**
 * A Technical Data Sheet field's value for one pulley. Project-information fields may
 * be keyed differently on a customised sheet (e.g. "pulleyTagName") from where the app
 * itself stores those values (`pulleyTag`, `qty`, the RFQ's quote reference), so an
 * empty value falls back to the latter.
 */
function fieldValue(field: TechDataField, col: Column, rfq: RFQ): string | number | undefined {
  const raw = field.auto ? (col.autoValues[field.key] ?? col.values[field.key]) : col.values[field.key]
  if (raw !== undefined && raw !== null && raw !== '') return catalogDisplayValue(field.catalogPrices, raw)
  if (field.fixedValue) return catalogDisplayValue(field.catalogPrices, field.fixedValue)
  const id = `${field.key} ${field.label}`
  if (/pulley\s*tag|tag\s*\/\s*name|pulleytag/i.test(id)) return col.values.pulleyTag
  if (/number\s*of\s*pulleys|\bqty\b|quantity/i.test(id)) return col.values.qty ?? col.item.quantity
  if (/quote\s*ref|project\s*\/\s*quote|quotereference/i.test(id)) return rfq.quoteReference || rfq.projectName || undefined
  return undefined
}

export function PricingToolPage() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const rfqsWithTechData = useMemo(() => rfqs.filter((r) => r.items.some((it) => isTechDataFilled(it.technicalData))), [rfqs])

  const [rfqId, setRfqId] = useState(rfqsWithTechData[0]?.id ?? '')
  const rfq = rfqs.find((r) => r.id === rfqId)
  const items = useMemo(() => (rfq ? rfq.items.filter((it) => isTechDataFilled(it.technicalData)) : []), [rfq])
  const [view, setView] = useState<ViewMode>('all')
  const [itemId, setItemId] = useState('')
  const item = items.find((it) => it.id === itemId) ?? items[0]
  const shownItems = view === 'all' ? items : item ? [item] : []

  const itemLabel = (it: RFQItem) => `${it.productName || `Pulley ${it.itemNo}`}${it.technicalData?.pulleyTag ? ` (${it.technicalData.pulleyTag})` : ''}`

  return (
    <div>
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label htmlFor="pts-rfq" className="text-xs font-medium text-[var(--color-ink-soft)]">
            RFQ
          </label>
          <select
            id="pts-rfq"
            value={rfqId}
            onChange={(e) => {
              setRfqId(e.target.value)
              setItemId('')
            }}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
          >
            <option value="">Select an RFQ with technical data...</option>
            {rfqsWithTechData.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfqNumber} — {r.endCustomer}
              </option>
            ))}
          </select>

          {items.length > 1 && (
            <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-sm" role="group" aria-label="Pulleys shown">
              {(['all', 'single'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={clsx(
                    'px-3 py-1.5',
                    view === mode ? 'bg-[var(--color-blue)] font-medium text-white' : 'bg-white text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]',
                  )}
                >
                  {mode === 'all' ? `All pulleys (${items.length})` : 'Single pulley'}
                </button>
              ))}
            </div>
          )}

          {items.length > 1 && view === 'single' && (
            <>
              <label htmlFor="pts-item" className="text-xs font-medium text-[var(--color-ink-soft)]">
                Pulley
              </label>
              <select
                id="pts-item"
                value={item?.id ?? ''}
                onChange={(e) => setItemId(e.target.value)}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {itemLabel(it)}
                  </option>
                ))}
              </select>
            </>
          )}

          {rfq && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/rfqs/${rfq.id}`)}>
              Open RFQ
            </Button>
          )}
        </div>
      </Card>

      {!rfq ? (
        <EmptyState
          title="No RFQ selected"
          description={
            rfqsWithTechData.length === 0
              ? 'No RFQ has captured technical data yet. Fill "Technical Data" on an item while creating an RFQ, then come back here.'
              : 'Pick an RFQ above to see its computed pricing.'
          }
        />
      ) : shownItems.length === 0 ? (
        <EmptyState title="No items with technical data on this RFQ" />
      ) : (
        <PricingSheet rfq={rfq} items={shownItems} />
      )}
    </div>
  )
}

function PricingSheet({ rfq, items }: { rfq: RFQ; items: RFQItem[] }) {
  // Subscribed so an edit on the Formulas / Cost Rate Tables pages recomputes immediately.
  const formulas = useFormulaStore((s) => s.formulas)
  const costRates = useFormulaStore((s) => s.costRates)
  const techDataFields = useFormulaStore((s) => s.techDataFields)
  const sectionsRegistry = useFormulaStore((s) => s.sections)
  // Section C's MHR rates — an edit on the In-House Hours page recomputes too.
  const inHouseHourRates = useReferenceStore((s) => s.inHouseHourRates)
  const techSections = useTechDataSections()

  const columns: Column[] = useMemo(
    () =>
      items.map((item) => {
        const values = item.technicalData ?? {}
        return { item, values, autoValues: computeAutoFields(values), pricing: computePulleyPricing(values) }
      }),
    // formulas/costRates/techDataFields/inHouseHourRates: recompute when they change, though read via getState().
    [items, formulas, costRates, techDataFields, inHouseHourRates],
  )
  const multi = columns.length > 1
  // Side by side: label | unit | one 140px column per pulley. A single pulley keeps the
  // stylesheet's layout (label | unit | 200px), including its phone-width variant.
  const gridStyle: CSSProperties = multi ? { gridTemplateColumns: `minmax(240px, 1fr) 56px repeat(${columns.length}, 140px)` } : {}

  // Sections 1-8: the Technical Data Sheet's own sections, in their numbered order.
  // Sourcing choices (srcRollingBending etc.) are drawn as Section 8 pills, wherever
  // the sheet keeps them.
  const inputSections = useMemo(() => {
    const srcKeys = new Set(PROCESS_SOURCING_MAP.map((p) => p.srcKey))
    const parsed = techSections
      .map((s, i) => ({ ...parseSectionTitle(s.title), fields: s.fields.filter((f) => !srcKeys.has(f.key)), index: i }))
      .filter((s) => s.fields.length > 0)
    const used = new Set(parsed.map((s) => s.code).filter((c): c is number => c !== null))
    let next = 1
    const withCodes = parsed.map((s) => {
      if (s.code !== null) return s
      while (used.has(next)) next++
      used.add(next)
      return { ...s, code: next }
    }) as { code: number; title: string; fields: TechDataField[]; index: number }[]
    const sourcingCode = used.has(8) ? Math.max(...used) + 1 : 8
    return { sections: withCodes.sort((a, b) => a.code - b.code || a.index - b.index), sourcingCode }
  }, [techSections])
  const maxInputCode = Math.max(inputSections.sourcingCode, ...inputSections.sections.map((s) => s.code))

  // Pricing Tool fields (Manage Sections -> Pricing Tool tab), shown read-only.
  const pricingFieldSections = useMemo(() => {
    const sectionOrder = Object.fromEntries(sectionsRegistry.map((s) => [s.label, s.order]))
    const bySection: Record<string, TechDataFieldDto[]> = {}
    for (const f of Object.values(techDataFields)) {
      if (f.sheet !== 'pricing_tool') continue
      ;(bySection[f.section] ??= []).push(f)
    }
    return Object.entries(bySection)
      .sort(([a], [b]) => (sectionOrder[a] ?? 999) - (sectionOrder[b] ?? 999) || a.localeCompare(b))
      .map(([title, fields]) => ({ title, fields: fields.sort((a, b) => a.order - b.order) }))
  }, [techDataFields, sectionsRegistry])

  const oemDiscountPct = Math.round((costRates.oemDiscount ?? 0.1) * 1000) / 10
  const gstPct = Math.round((costRates.gstRate ?? 0.18) * 1000) / 10
  const share = (p: PulleyPricingResult, total: number) => `${(((total * p.qty) / (p.totalDirectCost > 0 ? p.totalDirectCost : 1)) * 100).toFixed(1)}%`
  const money = (pick: (p: PulleyPricingResult) => number) => columns.map((c) => fmtNumber(pick(c.pricing), 0))
  const row = (label: string, cells: ReactNode[], opts: { unit?: string; total?: boolean; keyRow?: boolean } = {}) => (
    <ValueRow key={label} label={label} cells={cells} gridStyle={gridStyle} {...opts} />
  )
  const first = columns[0]
  const missingRateLabels = IN_HOUSE_OPERATIONS.filter((op) => first.pricing.missingInHouseRates.includes(op.key)).map((op) => op.label)

  const head = (
    <PulleyHeaderRow
      columns={columns}
      gridStyle={gridStyle}
      show={multi}
    />
  )

  return (
    <div className={clsx('pts-card', multi && 'pts-multi')}>
      <div className="pts-top">
        <div>
          <div className="pts-brand">Pricing Tool</div>
          <div className="pts-sub">{multi ? `${columns.length} pulleys` : first.item.productName || 'Pulley'}</div>
        </div>
        <div className="pts-meta">
          {rfq.rfqNumber} — {rfq.endCustomer}
          {!multi && first.values.pulleyTag ? <div>{String(first.values.pulleyTag)}</div> : null}
        </div>
      </div>

      <div className="pts-part">
        <div className="pts-pbar">
          <span className="pts-pt">Inputs and specifications</span>
          <span className="pts-pc">Sections 1 to {maxInputCode}</span>
        </div>
        <div className="pts-scroll">
          {head}
          {inputSections.sections.map((section) => {
            const color = INPUT_COLORS[section.code] ?? EXTRA_COLORS[section.code % EXTRA_COLORS.length]
            if (section.fields.some((f) => f.key === 'bearing1Designation')) {
              return (
                <BearingsSection
                  key={section.code + section.title}
                  code={section.code}
                  title={section.title}
                  color={color}
                  fields={section.fields}
                  columns={columns}
                  techDataFields={techDataFields}
                  gridStyle={gridStyle}
                  renderPlainRow={(f) => row(f.label, columns.map((c) => fmtValue(fieldValue(f, c, rfq))), { unit: f.unit, total: isTotalRow(f) })}
                />
              )
            }
            return (
              <SheetSection key={section.code + section.title} code={section.code} title={section.title} color={color}>
                {section.fields.map((f) => row(f.label, columns.map((c) => fmtValue(fieldValue(f, c, rfq))), { unit: f.unit, total: isTotalRow(f) }))}
              </SheetSection>
            )
          })}

          <SheetSection code={inputSections.sourcingCode} title="Sourcing selection" color={INPUT_COLORS[8]}>
            {PROCESS_SOURCING_MAP.map((p) => row(p.label, columns.map((c) => <SourcingPill key={c.item.id} value={c.values[p.srcKey]} />)))}
          </SheetSection>
        </div>
      </div>

      <div className="pts-part">
        <div className="pts-pbar">
          <span className="pts-pt">Cost build-up and pricing</span>
          <span className="pts-pc">Sections A to F</span>
        </div>
        <div className="pts-scroll">
          {head}
          {COST_SECTIONS.map((s) => (
            <SheetSection key={s.code} code={s.code} title={s.title} color={s.color}>
              {first.pricing[s.lines].map((line, i) =>
                row(
                  line.label,
                  columns.map((c) => fmtCost(c.pricing[s.lines][i])),
                  { unit: 'INR' },
                ),
              )}
              {row(s.totalLabel, money((p) => p[s.total]), { unit: 'INR', total: true })}
              {s.code === 'C' && missingRateLabels.length > 0 && (
                <p className="pts-warn" role="note">
                  No MHR rate on the In-House Hours page for {missingRateLabels.join(', ')} — costed at 0.
                </p>
              )}
            </SheetSection>
          ))}

          {pricingFieldSections.map((section, i) => (
            <SheetSection key={section.title} code={`P${i + 1}`} title={section.title} color={PRICING_FIELD_COLORS[i % PRICING_FIELD_COLORS.length]}>
              {section.fields.map((field) =>
                row(
                  field.label,
                  columns.map((c) =>
                    fmtValue(
                      catalogDisplayValue(
                        field.option_prices,
                        field.fixed_value || (field.is_read_only ? (c.autoValues[field.key] ?? c.values[field.key]) : c.values[field.key]),
                      ),
                    ),
                  ),
                  { unit: field.unit },
                ),
              )}
            </SheetSection>
          ))}

          <SheetSection code="F" title="Cost summary & pricing" color={SECTION_F_COLOR}>
            {row('Total Rematerialise Cost (A)', money((p) => p.totalA), { unit: 'INR' })}
            {row('Total Ancillary Parts Cost (B)', money((p) => p.totalB), { unit: 'INR' })}
            {row('Total In-House Processing (C)', money((p) => p.totalC), { unit: 'INR' })}
            {row('Total Outsourced Processing (D)', money((p) => p.totalD), { unit: 'INR' })}
            {row('Total Packing & Shipment (E)', money((p) => p.totalE), { unit: 'INR' })}
            {row('TOTAL DIRECT COST (A+B+C+D+E) — INR', money((p) => p.totalDirectCost), { unit: 'INR', total: true })}
            {row('→ Raw Materials %', columns.map((c) => share(c.pricing, c.pricing.totalA)), { unit: '%' })}
            {row('→ Ancillary Parts %', columns.map((c) => share(c.pricing, c.pricing.totalB)), { unit: '%' })}
            {row('→ In-House Processing %', columns.map((c) => share(c.pricing, c.pricing.totalC)), { unit: '%' })}
            {row('→ Outsourced Processing %', columns.map((c) => share(c.pricing, c.pricing.totalD)), { unit: '%' })}
            {row('→ Packing & Shipment %', columns.map((c) => share(c.pricing, c.pricing.totalE)), { unit: '%' })}
            {row('Gross List Price / Pulley (HK0 × markup) INR', money((p) => p.listPrice), { unit: 'INR' })}
            {row(`Net OEM Price / Pulley (−${oemDiscountPct}% OEM discount) INR`, money((p) => p.netOemPrice), { unit: 'INR', keyRow: true })}
            {row(`Price incl. GST @ ${gstPct}% INR`, money((p) => p.priceInclGst), { unit: 'INR' })}
            {row('Net Price EUR equivalent', money((p) => p.netPriceEur), { unit: 'EUR' })}
            {row('Gross Margin %', columns.map((c) => `${c.pricing.grossMarginPercent.toFixed(1)}%`), { unit: '%' })}
            {row('Item Total (Qty × Net OEM Price) INR', money((p) => p.itemTotal), { unit: 'INR', keyRow: true })}
          </SheetSection>

          {multi && (
            <div className="pts-grand">
              <span>RFQ total — all {columns.length} pulleys (Σ Item Total)</span>
              <span className="pts-grand-v">INR {fmtNumber(columns.reduce((sum, c) => sum + c.pricing.itemTotal, 0), 0)}</span>
            </div>
          )}
        </div>
      </div>

      <footer className="pts-foot">Live values come from the RFQ.</footer>
    </div>
  )
}

/** Column headings when several pulleys are shown side by side. */
function PulleyHeaderRow({ columns, gridStyle, show }: { columns: Column[]; gridStyle: CSSProperties; show: boolean }) {
  if (!show) return null
  return (
    <div className="pts-row pts-colhead" style={gridStyle}>
      <span>Pulley</span>
      <span className="pts-u"></span>
      {columns.map((c) => (
        <span key={c.item.id} className="pts-v">
          <span className="pts-colname">{c.item.productName || 'Pulley'}</span>
          <span className="pts-coltag">
            {c.values.pulleyTag ? String(c.values.pulleyTag) : '—'} · Qty {fmtValue(c.values.qty ?? c.item.quantity)}
          </span>
        </span>
      ))}
    </div>
  )
}

function SheetSection({ code, title, color, children }: { code: number | string; title: string; color: string; children: ReactNode }) {
  return (
    <section className="pts-sec" style={sectionStyle(color)} aria-label={`${code}. ${title}`}>
      <div className="pts-sh">
        <span className="pts-code">{code}</span>
        <span className="pts-st">{title}</span>
      </div>
      {children}
    </section>
  )
}

function ValueRow({
  label,
  unit,
  cells,
  gridStyle,
  total,
  keyRow,
}: {
  label: string
  unit?: string
  cells: ReactNode[]
  gridStyle: CSSProperties
  total?: boolean
  keyRow?: boolean
}) {
  return (
    <div className={clsx('pts-row', total && 'pts-total', keyRow && 'pts-key')} style={gridStyle}>
      <span className="pts-l">{label}</span>
      <span className="pts-u">{unit}</span>
      {cells.map((cell, i) => (
        <span key={i} className="pts-v">
          {cell}
        </span>
      ))}
    </div>
  )
}

function SourcingPill({ value }: { value: string | number | undefined }) {
  const text = value === undefined || value === null ? '' : String(value).trim()
  if (!text) return <>—</>
  if (/out/i.test(text)) return <span className="pts-tag pts-out">{text}</span>
  if (/in[\s-]?house/i.test(text)) return <span className="pts-tag pts-in">{text}</span>
  return <>{text}</>
}

/**
 * Section 5 — Bearings, housings & sleeves, read-only. Each component's designation is
 * followed by its price: the live catalog price (Bearing & Sleeve Data / Housing master
 * data) for that designation, or the price saved on the item if it isn't in the catalog.
 */
function BearingsSection({
  code,
  title,
  color,
  fields,
  columns,
  techDataFields,
  gridStyle,
  renderPlainRow,
}: {
  code: number
  title: string
  color: string
  fields: TechDataField[]
  columns: Column[]
  techDataFields: Record<string, TechDataFieldDto>
  gridStyle: CSSProperties
  renderPlainRow: (field: TechDataField) => ReactNode
}) {
  const bearings = useReferenceStore((s) => s.bearings)
  const sleeves = useReferenceStore((s) => s.sleeves)
  const housings = useReferenceStore((s) => s.housings)

  const sleeveKey = SLEEVE_KEYS.find((k) => fields.some((f) => f.key === k)) ?? 'sleeveCode'
  const handledKeys = new Set(['bearing1Designation', 'bearing2Designation', 'housingDesignation', sleeveKey])
  const otherFields = fields.filter((f) => !handledKeys.has(f.key) && !/^total/i.test(f.key))

  const perColumn = columns.map(({ values, autoValues }) => {
    const current = (key: string) => {
      const v = techDataFields[key]?.is_read_only ? (autoValues[key] ?? values[key]) : values[key]
      const shown = v === undefined || v === null || v === '' ? techDataFields[key]?.fixed_value : v
      return shown === undefined || shown === null ? '' : String(shown)
    }
    const b1 = current('bearing1Designation')
    const b2 = current('bearing2Designation')
    const sl = current(sleeveKey)
    const hs = current('housingDesignation')
    // A sleeve code can be listed for several bearings — prefer the row for Bearing 1.
    const sleeveRow = sleeves.find((s) => s.sleeve_code === sl && s.for_bearing === b1) ?? sleeves.find((s) => s.sleeve_code === sl)
    const saved = (key: string) => Number(values[key]) || 0
    const p1 = b1 ? (bearings.find((b) => b.designation === b1)?.price_inr ?? saved('bearing1Price')) : 0
    const p2 = b2 ? (bearings.find((b) => b.designation === b2)?.price_inr ?? saved('bearing2Price')) : 0
    const ps = sl ? (sleeveRow?.price_inr ?? saved('sleevePrice')) : 0
    const ph = hs ? (housings.find((h) => h.housing_designation === hs)?.price_inr ?? saved('housingPrice')) : 0
    return { b1, b2, sl, hs, p1, p2, ps, ph, total: 2 * (p1 + p2 + ps + ph) }
  })

  const label = (key: string, fallback: string) => fields.find((f) => f.key === key)?.label ?? fallback
  const price = (designation: string, p: number) => (designation ? fmtNumber(p, 0) : '—')
  const r = (rowLabel: string, cells: ReactNode[], opts: { unit?: string; total?: boolean } = {}) => (
    <ValueRow key={rowLabel} label={rowLabel} cells={cells} gridStyle={gridStyle} {...opts} />
  )

  return (
    <SheetSection code={code} title={title} color={color}>
      {r(label('bearing1Designation', 'Bearing 1 Designation'), perColumn.map((c) => fmtValue(c.b1)))}
      {r('Bearing 1 Price (INR/ea)', perColumn.map((c) => price(c.b1, c.p1)), { unit: 'INR' })}
      {r(label('bearing2Designation', 'Bearing 2 Designation'), perColumn.map((c) => fmtValue(c.b2)))}
      {r('Bearing 2 Price (INR/ea)', perColumn.map((c) => price(c.b2, c.p2)), { unit: 'INR' })}
      {r(label(sleeveKey, 'Adapter Sleeve Code'), perColumn.map((c) => fmtValue(c.sl)))}
      {r('Sleeve Price (INR/ea)', perColumn.map((c) => price(c.sl, c.ps)), { unit: 'INR' })}
      {r(label('housingDesignation', 'Housing Designation'), perColumn.map((c) => fmtValue(c.hs)))}
      {r('Housing Price (INR/ea)', perColumn.map((c) => price(c.hs, c.ph)), { unit: 'INR' })}
      {otherFields.map(renderPlainRow)}
      {r('Total Bearings + Sleeves + Housings (2× each)', perColumn.map((c) => fmtNumber(c.total, 0)), { unit: 'INR', total: true })}
    </SheetSection>
  )
}
