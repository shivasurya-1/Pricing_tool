import { useMemo, useRef, useState } from 'react'
import { Info, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore, type FormulaDefinitionDto, type TechDataFieldDto } from '@/store/formulaStore'
import { useUiStore } from '@/store/uiStore'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { toNumericVars } from '@/lib/pulleyTechDataCalc'
import { computePulleyPricing, buildPricingVariables } from '@/lib/pulleyPricingCalc'
import { evaluateFormula, FormulaError } from '@/lib/formulaEval'
import { formatCurrency } from '@/lib/format'
import { ApiError } from '@/lib/apiClient'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'

// Rate-lookup variables the in-house-hours Auto formulas can reference — not fields
// themselves (see backend/formulas/views.py's INJECTED_RATE_VARIABLES), but valid to
// use in a new formula, so they're offered in the "Insert" picker and recognized by
// the variable-detection scan below.
const INJECTED_RATE_VARIABLES = ['c1RateInrPerHour', 'c2RateInrPerHour', 'c3RateInrPerHour', 'c4RateInrPerHour', 'c5RateInrPerHour', 'c6RateInrPerHour', 'c7RateInrPerHour']

const OPERATOR_TOKENS = ['+', '-', '*', '/', '(', ')']

function slugifyToCamelCase(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return ''
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('')
}

const SECTION_LABELS: Record<string, string> = {
  TechDataAuto: 'Technical Data Sheet — Auto Fields',
  SectionA: 'Pricing Section A — Raw Materials',
  SectionB: 'Pricing Section B — Ancillary Parts',
  SectionC: 'Pricing Section C — In-House Processing',
  SectionD: 'Pricing Section D — Outsourced Processing',
  SectionE: 'Pricing Section E — Packing & Shipment',
  SectionF: 'Pricing Section F — Summary',
}
const SECTION_ORDER = Object.keys(SECTION_LABELS)

export function FormulasPage() {
  const rfqs = useDataStore((s) => s.rfqs)
  const { loaded, loading, formulas, costRates, techDataFields, updateFormula, createTechDataField, deleteTechDataField } = useFormulaStore()
  const pushToast = useUiStore((s) => s.pushToast)
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TechDataFieldDto | null>(null)

  const rfqsWithTechData = useMemo(() => rfqs.filter((r) => r.items.some((it) => isTechDataFilled(it.technicalData))), [rfqs])
  const [rfqId, setRfqId] = useState(rfqsWithTechData[0]?.id ?? '')
  const rfq = rfqs.find((r) => r.id === rfqId)
  const items = useMemo(() => (rfq ? rfq.items.filter((it) => isTechDataFilled(it.technicalData)) : []), [rfq])
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const item = items.find((it) => it.id === itemId) ?? items[0]

  const sampleVars = useMemo(() => {
    if (!item?.technicalData) return {}
    const pricing = computePulleyPricing(item.technicalData)
    return {
      ...toNumericVars(item.technicalData),
      ...buildPricingVariables(item.technicalData, costRates),
      totalA: pricing.totalA,
      totalB: pricing.totalB,
      totalC: pricing.totalC,
      totalD: pricing.totalD,
      totalE: pricing.totalE,
      totalDirectCostPerUnit: pricing.totalDirectCostPerUnit,
      totalDirectCost: pricing.totalDirectCost,
      listPrice: pricing.listPrice,
      netOemPrice: pricing.netOemPrice,
    }
  }, [item, costRates, formulas])

  const grouped = useMemo(() => {
    const bySection: Record<string, FormulaDefinitionDto[]> = {}
    for (const f of Object.values(formulas)) {
      bySection[f.section] = bySection[f.section] ?? []
      bySection[f.section].push(f)
    }
    for (const list of Object.values(bySection)) list.sort((a, b) => a.order - b.order)
    return bySection
  }, [formulas])

  const techDataSections = useMemo(() => [...new Set(Object.values(techDataFields).map((f) => f.section))].sort(), [techDataFields])
  const techDataBySection = useMemo(() => {
    const bySection: Record<string, TechDataFieldDto[]> = {}
    for (const f of Object.values(techDataFields)) {
      bySection[f.section] = bySection[f.section] ?? []
      bySection[f.section].push(f)
    }
    for (const list of Object.values(bySection)) list.sort((a, b) => a.order - b.order)
    return bySection
  }, [techDataFields])

  if (loading) return <EmptyState title="Loading formulas..." />
  if (!loaded) {
    return (
      <div>
        <PageHeader title="Formulas" description="Edit the actual calculation behind every auto-calculated field." />
        <EmptyState
          title="Backend not reachable"
          description="The Formulas page needs the Django backend running (see /backend/README.md). Every calculation keeps working normally off the built-in defaults in the meantime."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Formulas"
        description="Edit the real expression behind every auto-calculated field — not just a rate, the actual formula. Changes apply everywhere immediately once saved."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddFieldOpen(true)}>
            Add Field
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Pick a real RFQ item below to preview against its actual numbers. Formulas use <code>pow(x, y)</code> for powers and{' '}
          <code>iff(condition, a, b)</code> instead of a ternary. Only plain arithmetic, comparisons, and that function whitelist are
          allowed — nothing else can run.
        </p>
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="text-xs font-medium text-[var(--color-ink-soft)]">Preview against RFQ</label>
          <select value={rfqId} onChange={(e) => setRfqId(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">No sample — show 0 for every input</option>
            {rfqsWithTechData.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rfqNumber} — {r.endCustomer}
              </option>
            ))}
          </select>
          {items.length > 1 && (
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.productName}
                </option>
              ))}
            </select>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        {SECTION_ORDER.filter((s) => grouped[s]?.length).map((section) => (
          <FormulaSectionCard
            key={section}
            title={SECTION_LABELS[section]}
            formulas={grouped[section]}
            sampleVars={sampleVars}
            onSave={async (key, expression) => {
              try {
                await updateFormula(key, expression)
                pushToast('Formula saved.', 'success')
              } catch (err) {
                pushToast(err instanceof Error ? err.message : 'Failed to save formula.', 'error')
              }
            }}
          />
        ))}
      </div>

      <div className="mt-8">
        <CardHeader title="Technical Data Sheet — Field Schema" description="Every field on the sheet Sales/Operations fill in. Add a new one below, Manual or Auto." />
        <div className="space-y-5">
          {techDataSections.map((section) => (
            <TechDataFieldSectionCard key={section} title={section} fields={techDataBySection[section]} onDelete={setDeleteTarget} />
          ))}
        </div>
      </div>

      <AddTechDataFieldModal
        open={addFieldOpen}
        onClose={() => setAddFieldOpen(false)}
        existingSections={techDataSections}
        sampleVars={sampleVars}
        onCreate={async (input) => {
          try {
            await createTechDataField(input)
            pushToast(`'${input.label}' added to the Technical Data Sheet.`, 'success')
            setAddFieldOpen(false)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to create field.', 'error')
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteTechDataField(deleteTarget.key)
            pushToast(`'${deleteTarget.label}' removed.`, 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete field.', 'error')
          } finally {
            setDeleteTarget(null)
          }
        }}
        title="Delete Field"
        description={`Remove '${deleteTarget?.label}' from the Technical Data Sheet? This can't be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function TechDataFieldSectionCard({
  title,
  fields,
  onDelete,
}: {
  title: string
  fields: TechDataFieldDto[]
  onDelete: (field: TechDataFieldDto) => void
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
              <th className="px-4 py-2 min-w-[220px]">Field</th>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-b border-[var(--color-border)] last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {f.label}
                  {f.unit && <span className="ml-1 text-xs text-[var(--color-ink-faint)]">({f.unit})</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-ink-faint)]">{f.key}</td>
                <td className="px-4 py-2.5 capitalize">{f.field_type}</td>
                <td className="px-4 py-2.5">
                  {f.is_auto ? (
                    <Badge tone="blue">Auto</Badge>
                  ) : f.is_catalog_derived ? (
                    <Badge tone="purple">Catalog</Badge>
                  ) : (
                    <Badge tone="neutral">Manual</Badge>
                  )}
                  {!f.is_core && (
                    <Badge tone="green" className="ml-1">
                      Custom
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!f.is_core && (
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => onDelete(f)}>
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function AddTechDataFieldModal({
  open,
  onClose,
  existingSections,
  sampleVars,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  existingSections: string[]
  sampleVars: Record<string, number>
  onCreate: (input: {
    key: string
    label: string
    section: string
    unit: string
    field_type: 'text' | 'number' | 'select'
    options: string[]
    is_auto: boolean
    expression: string
    input_variables: string[]
    output_unit: string
  }) => Promise<void>
}) {
  const techDataFields = useFormulaStore((s) => s.techDataFields)
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [section, setSection] = useState(existingSections[0] ?? '')
  const [newSection, setNewSection] = useState('')
  const [unit, setUnit] = useState('')
  const [fieldType, setFieldType] = useState<'text' | 'number' | 'select'>('text')
  const [optionsText, setOptionsText] = useState('')
  const [isAuto, setIsAuto] = useState(false)
  const [expression, setExpression] = useState('')
  const [insertKey, setInsertKey] = useState('')
  const [saving, setSaving] = useState(false)
  const expressionRef = useRef<HTMLTextAreaElement>(null)

  const reset = () => {
    setLabel('')
    setKey('')
    setKeyEdited(false)
    setSection(existingSections[0] ?? '')
    setNewSection('')
    setUnit('')
    setFieldType('text')
    setOptionsText('')
    setIsAuto(false)
    setExpression('')
    setInsertKey('')
  }

  const handleLabelChange = (v: string) => {
    setLabel(v)
    if (!keyEdited) setKey(slugifyToCamelCase(v))
  }

  // Sorted for the picker; the field currently being created is excluded (referencing
  // itself in its own formula would always be a circular-dependency mistake).
  const insertableFields = useMemo(
    () =>
      Object.values(techDataFields)
        .filter((f) => f.key !== key)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [techDataFields, key],
  )

  const insertToken = (token: string) => {
    const el = expressionRef.current
    const start = el?.selectionStart ?? expression.length
    const end = el?.selectionEnd ?? expression.length
    const needsLeadingSpace = start > 0 && !/\s$/.test(expression.slice(0, start)) && /[a-zA-Z0-9_]/.test(token[0])
    const insert = (needsLeadingSpace ? ' ' : '') + token
    const next = expression.slice(0, start) + insert + expression.slice(end)
    setExpression(next)
    requestAnimationFrame(() => {
      const pos = start + insert.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  // Variables are detected from the expression itself (word-boundary match against
  // every known field key, plus the injected rate-lookup variables) rather than typed
  // separately — one fewer place to make a typo, and it can never drift out of sync
  // with what the expression actually references.
  const knownKeys = useMemo(() => [...Object.keys(techDataFields), ...INJECTED_RATE_VARIABLES], [techDataFields])
  const detectedVariables = useMemo(
    () => knownKeys.filter((k) => k !== key && new RegExp(`\\b${k}\\b`).test(expression)),
    [expression, knownKeys, key],
  )

  const preview = (() => {
    if (!isAuto || !expression.trim()) return null
    try {
      const vars = Object.fromEntries(detectedVariables.map((v) => [v, sampleVars[v] ?? 0]))
      return { value: evaluateFormula(expression, vars), error: null as string | null }
    } catch (err) {
      return { value: null as number | null, error: err instanceof FormulaError ? err.message : 'Invalid expression' }
    }
  })()

  const effectiveSection = section === '__new__' ? newSection.trim() : section
  const canSave =
    label.trim() && key.trim() && effectiveSection && (fieldType !== 'select' || isAuto || optionsText.trim()) && (!isAuto || (expression.trim() && !preview?.error))

  const handleSave = async () => {
    setSaving(true)
    await onCreate({
      key: key.trim(),
      label: label.trim(),
      section: effectiveSection,
      unit,
      field_type: fieldType,
      options: fieldType === 'select' ? optionsText.split(',').map((o) => o.trim()).filter(Boolean) : [],
      is_auto: isAuto,
      expression,
      input_variables: detectedVariables,
      output_unit: unit,
    })
    setSaving(false)
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose()
        reset()
      }}
      title="Add Technical Data Sheet Field"
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            Add Field
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Label</label>
          <input value={label} onChange={(e) => handleLabelChange(e.target.value)} className={inputClass} placeholder="e.g. Coupling Weight" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Key (variable name used in formulas)</label>
          <input
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setKeyEdited(true)
            }}
            className={clsx(inputClass, 'font-mono')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Section</label>
            <select value={section} onChange={(e) => setSection(e.target.value)} className={inputClass}>
              {existingSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="__new__">+ New section...</option>
            </select>
            {section === '__new__' && (
              <input value={newSection} onChange={(e) => setNewSection(e.target.value)} className={clsx(inputClass, 'mt-1.5')} placeholder="Section title" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} placeholder="e.g. kg, INR, mm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Type</label>
          <div className="flex gap-2">
            {(['text', 'number', 'select'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFieldType(t)}
                className={clsx(
                  'flex-1 rounded-md border px-3 py-1.5 text-sm capitalize',
                  fieldType === t ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)] text-[var(--color-blue)]' : 'border-[var(--color-border)]',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {fieldType === 'select' && !isAuto && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Options (comma-separated)</label>
            <input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className={inputClass} placeholder="Option A, Option B, Option C" />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAuto} onChange={(e) => setIsAuto(e.target.checked)} className="rounded border-[var(--color-border)]" />
          Auto — computed from a formula, read-only on the sheet
        </label>

        {isAuto && (
          <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Insert a field</label>
                <select
                  value={insertKey}
                  onChange={(e) => {
                    if (e.target.value) insertToken(e.target.value)
                    setInsertKey('')
                  }}
                  className={inputClass}
                >
                  <option value="">Pick a field to insert...</option>
                  {insertableFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                  <optgroup label="Labour rate lookups">
                    {INJECTED_RATE_VARIABLES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Operators</label>
                <div className="flex gap-1">
                  {OPERATOR_TOKENS.map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => insertToken(op)}
                      className="flex-1 rounded-md border border-[var(--color-border)] py-1.5 font-mono text-sm hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)]"
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Expression</label>
              <textarea
                ref={expressionRef}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[var(--color-border)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--color-blue)]"
                placeholder="Pick a field above, or type e.g. shellOD * 2 — type numbers and + - * / directly"
              />
              <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
                Detected variables:{' '}
                {detectedVariables.length > 0 ? (
                  detectedVariables.map((v) => (
                    <Badge key={v} tone="neutral" className="ml-1">
                      {v}
                    </Badge>
                  ))
                ) : (
                  <span className="italic">none yet</span>
                )}
              </p>
            </div>
            {preview?.error && <p className="text-xs text-[var(--color-red)]">{preview.error}</p>}
            {preview && preview.value !== null && (
              <p className="text-xs text-[var(--color-ink-faint)]">
                Preview: <span className="font-semibold text-[var(--color-blue)]">{preview.value}</span> (against the RFQ selected above, unfilled variables read as 0)
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function FormulaSectionCard({
  title,
  formulas,
  sampleVars,
  onSave,
}: {
  title: string
  formulas: FormulaDefinitionDto[]
  sampleVars: Record<string, number>
  onSave: (key: string, expression: string) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
              <th className="px-4 py-2 min-w-[220px]">Field</th>
              <th className="px-4 py-2 min-w-[320px]">Expression</th>
              <th className="px-4 py-2 min-w-[180px]">Variables</th>
              <th className="px-4 py-2 text-right">Result (sample)</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {formulas.map((f) => (
              <FormulaRow key={f.key} formula={f} sampleVars={sampleVars} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function FormulaRow({
  formula,
  sampleVars,
  onSave,
}: {
  formula: FormulaDefinitionDto
  sampleVars: Record<string, number>
  onSave: (key: string, expression: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(formula.expression)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== formula.expression

  const evaluate = (expression: string): { value: number | null; error: string | null } => {
    try {
      return { value: evaluateFormula(expression, sampleVars), error: null }
    } catch (err) {
      return { value: null, error: err instanceof FormulaError ? err.message : 'Invalid expression' }
    }
  }

  const current = evaluate(formula.expression)
  const candidate = dirty ? evaluate(draft) : current

  const handleSave = async () => {
    setSaving(true)
    await onSave(formula.key, draft)
    setSaving(false)
  }

  return (
    <tr className={clsx('border-b border-[var(--color-border)] align-top last:border-0', dirty && 'bg-[var(--color-amber-50)]')}>
      <td className="px-4 py-2.5 font-medium">
        {formula.label}
        {formula.output_unit && <span className="ml-1 text-xs text-[var(--color-ink-faint)]">({formula.output_unit})</span>}
      </td>
      <td className="px-4 py-2.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-[var(--color-border)] px-2 py-1.5 font-mono text-xs outline-none focus:border-[var(--color-blue)]"
        />
        {dirty && candidate.error && <p className="mt-1 text-xs text-[var(--color-red)]">{candidate.error}</p>}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {formula.input_variables.map((v) => (
            <Badge key={v} tone="neutral">
              {v}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        {dirty ? (
          <div className="space-y-0.5">
            <p className="text-[var(--color-ink-faint)] line-through">{current.value !== null ? formatCurrency(current.value) : '—'}</p>
            <p className="font-semibold text-[var(--color-blue)]">{candidate.value !== null ? formatCurrency(candidate.value) : 'error'}</p>
          </div>
        ) : (
          <span className="font-medium">{current.value !== null ? formatCurrency(current.value) : current.error}</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {dirty && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => setDraft(formula.expression)}>
              Reset
            </Button>
            <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={handleSave} disabled={saving || !!candidate.error}>
              Save
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}
