import { useMemo, useState } from 'react'
import { Info, RotateCcw, Save } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore, type FormulaDefinitionDto } from '@/store/formulaStore'
import { useUiStore } from '@/store/uiStore'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { toNumericVars } from '@/lib/pulleyTechDataCalc'
import { computePulleyPricing, buildPricingVariables } from '@/lib/pulleyPricingCalc'
import { evaluateFormula, FormulaError } from '@/lib/formulaEval'
import { formatCurrency } from '@/lib/format'

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
  const { loaded, loading, formulas, costRates, updateFormula } = useFormulaStore()
  const pushToast = useUiStore((s) => s.pushToast)

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
    </div>
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
