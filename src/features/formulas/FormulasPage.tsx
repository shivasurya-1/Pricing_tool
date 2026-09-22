import { useMemo, useRef, useState } from 'react'
import { Info, Layers, ListTree, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { useFormulaStore, type FormulaDefinitionDto, type SectionDto, type TechDataFieldDto } from '@/store/formulaStore'
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

// Matches backend/formulas/models.py's TECH_DATA_AUTO_SECTION_LABEL — the one
// formula section that isn't a pricing stage, used to split the page into
// "Technical Sheet Formulas" vs "Pricing Tool Formulas" tabs below.
const TECH_DATA_AUTO_SECTION_LABEL = 'Technical Data Sheet — Auto Fields'
const FORMULA_TABS = ['Technical Sheet Formulas', 'Pricing Tool Formulas'] as const

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

export function FormulasPage() {
  const rfqs = useDataStore((s) => s.rfqs)
  const role = useAuthStore((s) => s.role)
  const {
    loaded,
    loading,
    formulas,
    costRates,
    techDataFields,
    sections,
    updateFormula,
    createFormula,
    deleteFormula,
    deleteAllFormulas,
    createTechDataField,
    updateTechDataField,
    deleteTechDataField,
    createSection,
    renameSection,
    deleteSection,
  } = useFormulaStore()
  const pushToast = useUiStore((s) => s.pushToast)
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TechDataFieldDto | null>(null)
  const [editTarget, setEditTarget] = useState<TechDataFieldDto | null>(null)
  const [addFormulaOpen, setAddFormulaOpen] = useState(false)
  const [deleteFormulaTarget, setDeleteFormulaTarget] = useState<FormulaDefinitionDto | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [sectionsManagerOpen, setSectionsManagerOpen] = useState(false)
  const [showTechDataSheet, setShowTechDataSheet] = useState(false)
  const [formulaTab, setFormulaTab] = useState<(typeof FORMULA_TABS)[number]>('Pricing Tool Formulas')

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

  const sectionOrder = useMemo(() => Object.fromEntries(sections.map((s) => [s.label, s.order])), [sections])
  const sectionLabels = useMemo(() => [...sections].sort((a, b) => a.order - b.order).map((s) => s.label), [sections])

  const grouped = useMemo(() => {
    const bySection: Record<string, FormulaDefinitionDto[]> = {}
    for (const f of Object.values(formulas)) {
      bySection[f.section] = bySection[f.section] ?? []
      bySection[f.section].push(f)
    }
    for (const list of Object.values(bySection)) list.sort((a, b) => a.order - b.order)
    return bySection
  }, [formulas])
  const formulaSectionsPresent = useMemo(
    () => Object.keys(grouped).sort((a, b) => (sectionOrder[a] ?? 999) - (sectionOrder[b] ?? 999)),
    [grouped, sectionOrder],
  )
  const technicalFormulaSections = useMemo(
    () => formulaSectionsPresent.filter((s) => s === TECH_DATA_AUTO_SECTION_LABEL),
    [formulaSectionsPresent],
  )
  const pricingFormulaSections = useMemo(
    () => formulaSectionsPresent.filter((s) => s !== TECH_DATA_AUTO_SECTION_LABEL),
    [formulaSectionsPresent],
  )

  const sectionUsage = useMemo(() => {
    const usage: Record<string, { formulaCount: number; fieldCount: number }> = {}
    for (const s of sections) usage[s.label] = { formulaCount: 0, fieldCount: 0 }
    for (const f of Object.values(formulas)) {
      usage[f.section] = usage[f.section] ?? { formulaCount: 0, fieldCount: 0 }
      usage[f.section].formulaCount++
    }
    for (const f of Object.values(techDataFields)) {
      usage[f.section] = usage[f.section] ?? { formulaCount: 0, fieldCount: 0 }
      usage[f.section].fieldCount++
    }
    return usage
  }, [sections, formulas, techDataFields])

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
          <>
            <Button variant="secondary" icon={<ListTree size={15} />} onClick={() => setShowTechDataSheet((v) => !v)}>
              {showTechDataSheet ? 'Hide' : 'View'} Technical Data Sheet
            </Button>
            <Button variant="secondary" icon={<Layers size={15} />} onClick={() => setSectionsManagerOpen(true)}>
              Manage Sections
            </Button>
            <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setAddFormulaOpen(true)}>
              Add Formula
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAddFieldOpen(true)}>
              Add Field
            </Button>
            {role === 'Admin' && (
              <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteAllOpen(true)}>
                Delete All Formulas
              </Button>
            )}
          </>
        }
      />

      {showTechDataSheet && <TechDataSheetStructureView sections={techDataSections} bySection={techDataBySection} />}

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

      <Card className="mb-5">
        <Tabs tabs={[...FORMULA_TABS]} active={formulaTab} onChange={(t) => setFormulaTab(t as (typeof FORMULA_TABS)[number])} />
      </Card>

      {formulaTab === 'Pricing Tool Formulas' && (
        <div className="space-y-5">
          {pricingFormulaSections.length === 0 ? (
            <EmptyState title="No pricing formulas" description="Add one with the 'Add Formula' button above." />
          ) : (
            pricingFormulaSections.map((section) => (
              <FormulaSectionCard
                key={section}
                title={section}
                formulas={grouped[section]}
                sampleVars={sampleVars}
                onDelete={setDeleteFormulaTarget}
                onSave={async (key, expression) => {
                  try {
                    await updateFormula(key, expression)
                    pushToast('Formula saved.', 'success')
                  } catch (err) {
                    pushToast(err instanceof Error ? err.message : 'Failed to save formula.', 'error')
                  }
                }}
              />
            ))
          )}
        </div>
      )}

      {formulaTab === 'Technical Sheet Formulas' && (
        <>
          <div className="space-y-5">
            {technicalFormulaSections.length === 0 ? (
              <EmptyState title="No Technical Data Sheet auto-formulas" description="Add one with the 'Add Formula' button above." />
            ) : (
              technicalFormulaSections.map((section) => (
                <FormulaSectionCard
                  key={section}
                  title={section}
                  formulas={grouped[section]}
                  sampleVars={sampleVars}
                  onDelete={setDeleteFormulaTarget}
                  onSave={async (key, expression) => {
                    try {
                      await updateFormula(key, expression)
                      pushToast('Formula saved.', 'success')
                    } catch (err) {
                      pushToast(err instanceof Error ? err.message : 'Failed to save formula.', 'error')
                    }
                  }}
                />
              ))
            )}
          </div>

          <div className="mt-8">
            <CardHeader title="Technical Data Sheet — Field Schema" description="Every field on the sheet Sales/Operations fill in. Add a new one below, Manual or Auto." />
            <div className="space-y-5">
              {techDataSections.map((section) => (
                <TechDataFieldSectionCard
                  key={section}
                  title={section}
                  fields={techDataBySection[section]}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <AddTechDataFieldModal
        open={addFieldOpen}
        onClose={() => setAddFieldOpen(false)}
        existingSections={sectionLabels}
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

      <EditTechDataFieldModal
        field={editTarget}
        existingSections={sectionLabels}
        onClose={() => setEditTarget(null)}
        onSave={async (patch) => {
          if (!editTarget) return
          try {
            await updateTechDataField(editTarget.key, patch)
            pushToast(`'${patch.label ?? editTarget.label}' updated.`, 'success')
            setEditTarget(null)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to update field.', 'error')
          }
        }}
      />

      <AddFormulaModal
        open={addFormulaOpen}
        onClose={() => setAddFormulaOpen(false)}
        sectionLabels={sectionLabels}
        sampleVars={sampleVars}
        onCreate={async (input) => {
          try {
            await createFormula(input)
            pushToast(`'${input.label}' added.`, 'success')
            setAddFormulaOpen(false)
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to create formula.', 'error')
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteFormulaTarget}
        onClose={() => setDeleteFormulaTarget(null)}
        onConfirm={async () => {
          if (!deleteFormulaTarget) return
          try {
            await deleteFormula(deleteFormulaTarget.key)
            pushToast(`'${deleteFormulaTarget.label}' deleted.`, 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete formula.', 'error')
          } finally {
            setDeleteFormulaTarget(null)
          }
        }}
        title="Delete Formula"
        description={`Delete '${deleteFormulaTarget?.label}'? This can't be undone. Blocked if another formula or Technical Data Sheet field still depends on it.`}
        confirmLabel="Delete"
        danger
      />

      <ConfirmDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={async () => {
          try {
            await deleteAllFormulas()
            pushToast('All formulas deleted.', 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete all formulas.', 'error')
          } finally {
            setDeleteAllOpen(false)
          }
        }}
        title="Delete ALL Formulas"
        description={`This permanently deletes all ${Object.keys(formulas).length} formulas, immediately affecting every live pricing calculation across the app. Any Technical Data Sheet field that was Auto-calculated from a deleted formula becomes a plain Manual field instead — nothing else breaks, but nothing recalculates on its own anymore either. This can't be undone.`}
        confirmLabel="Delete All Formulas"
        danger
      />

      <SectionsManagerModal
        open={sectionsManagerOpen}
        onClose={() => setSectionsManagerOpen(false)}
        sections={sections}
        usage={sectionUsage}
        onCreate={async (input) => {
          try {
            await createSection(input)
            pushToast(`Section '${input.label}' added.`, 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to add section.', 'error')
          }
        }}
        onRename={async (id, label) => {
          try {
            await renameSection(id, label)
            pushToast('Section renamed.', 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to rename section.', 'error')
          }
        }}
        onDelete={async (section) => {
          try {
            await deleteSection(section.id)
            pushToast(`Section '${section.label}' deleted.`, 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete section.', 'error')
          }
        }}
      />
    </div>
  )
}

function TechDataSheetStructureView({ sections, bySection }: { sections: string[]; bySection: Record<string, TechDataFieldDto[]> }) {
  return (
    <Card className="mb-5">
      <CardHeader title="Technical Data Sheet — Structure" description="Every section and field on the sheet, read-only — not tied to any one RFQ." />
      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
        {sections.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">No fields defined yet.</p>
        ) : (
          sections.map((section) => (
            <div key={section}>
              <p className="mb-1.5 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-blue)]">
                {section}
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {bySection[section].map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--color-border)] py-1 text-sm">
                    <span className="text-[var(--color-ink-soft)]">
                      {f.label} <span className="font-mono text-xs text-[var(--color-ink-faint)]">({f.key})</span>
                    </span>
                    <span className="shrink-0">
                      {f.is_auto ? (
                        <Badge tone="blue">Auto{f.expression ? `: ${f.expression}` : ''}</Badge>
                      ) : f.is_catalog_derived ? (
                        <Badge tone="purple">Catalog</Badge>
                      ) : (
                        <Badge tone="neutral">Manual{f.unit ? ` (${f.unit})` : ''}</Badge>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function SectionsManagerModal({
  open,
  onClose,
  sections,
  usage,
  onCreate,
  onRename,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  sections: SectionDto[]
  usage: Record<string, { formulaCount: number; fieldCount: number }>
  onCreate: (input: { key: string; label: string; order?: number }) => Promise<void>
  onRename: (id: number, label: string) => Promise<void>
  onDelete: (section: SectionDto) => Promise<void>
}) {
  const [newLabel, setNewLabel] = useState('')
  const [renameDrafts, setRenameDrafts] = useState<Record<number, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<SectionDto | null>(null)
  const [saving, setSaving] = useState(false)

  const sorted = [...sections].sort((a, b) => a.order - b.order)

  const handleCreate = async () => {
    const label = newLabel.trim()
    if (!label) return
    setSaving(true)
    await onCreate({ key: slugifyToCamelCase(label) || `section-${Date.now()}`, label, order: sections.length })
    setSaving(false)
    setNewLabel('')
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Manage Sections" width="max-w-lg">
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-ink-faint)]">
            Shared by both Formulas and the Technical Data Sheet. Renaming updates every formula/field already assigned to it.
          </p>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {sorted.map((s) => {
              const u = usage[s.label] ?? { formulaCount: 0, fieldCount: 0 }
              return (
                <div key={s.id} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={renameDrafts[s.id] ?? s.label}
                      onChange={(e) => setRenameDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                      className={clsx(inputClass, 'flex-1')}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={(renameDrafts[s.id] ?? s.label) === s.label || !(renameDrafts[s.id] ?? '').trim()}
                      onClick={async () => {
                        await onRename(s.id, renameDrafts[s.id].trim())
                        setRenameDrafts((d) => {
                          const next = { ...d }
                          delete next[s.id]
                          return next
                        })
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => setDeleteTarget(s)} />
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {u.formulaCount > 0 && (
                      <Badge tone={s.label === TECH_DATA_AUTO_SECTION_LABEL ? 'purple' : 'blue'}>
                        {u.formulaCount} formula{u.formulaCount === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {u.fieldCount > 0 && <Badge tone="teal">{u.fieldCount} field{u.fieldCount === 1 ? '' : 's'}</Badge>}
                    {u.formulaCount === 0 && u.fieldCount === 0 && <Badge tone="neutral">Unused</Badge>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 border-t border-[var(--color-border)] pt-3">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className={inputClass} placeholder="New section name" />
            <Button variant="primary" disabled={!newLabel.trim() || saving} onClick={handleCreate}>
              Add Section
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await onDelete(deleteTarget)
          setDeleteTarget(null)
        }}
        title="Delete Section"
        description={`Delete '${deleteTarget?.label}'? Blocked while any formula or field still uses it.`}
        confirmLabel="Delete"
        danger
      />
    </>
  )
}

function AddFormulaModal({
  open,
  onClose,
  sectionLabels,
  sampleVars,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  sectionLabels: string[]
  sampleVars: Record<string, number>
  onCreate: (input: { key: string; label: string; section: string; expression: string; input_variables: string[]; output_unit: string }) => Promise<void>
}) {
  const formulas = useFormulaStore((s) => s.formulas)
  const techDataFields = useFormulaStore((s) => s.techDataFields)
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [section, setSection] = useState(sectionLabels[0] ?? '')
  const [outputUnit, setOutputUnit] = useState('')
  const [expression, setExpression] = useState('')
  const [insertKey, setInsertKey] = useState('')
  const [saving, setSaving] = useState(false)
  const expressionRef = useRef<HTMLTextAreaElement>(null)

  const reset = () => {
    setLabel('')
    setKey('')
    setKeyEdited(false)
    setSection(sectionLabels[0] ?? '')
    setOutputUnit('')
    setExpression('')
    setInsertKey('')
  }

  const handleLabelChange = (v: string) => {
    setLabel(v)
    if (!keyEdited) setKey(slugifyToCamelCase(v))
  }

  const insertableKeys = useMemo(
    () => [...new Set([...Object.keys(formulas), ...Object.keys(techDataFields)])].filter((k) => k !== key).sort(),
    [formulas, techDataFields, key],
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

  const knownKeys = useMemo(() => [...insertableKeys, ...INJECTED_RATE_VARIABLES], [insertableKeys])
  const detectedVariables = useMemo(
    () => knownKeys.filter((k) => k !== key && new RegExp(`\\b${k}\\b`).test(expression)),
    [expression, knownKeys, key],
  )

  const preview = (() => {
    if (!expression.trim()) return null
    try {
      const vars = Object.fromEntries(detectedVariables.map((v) => [v, sampleVars[v] ?? 0]))
      return { value: evaluateFormula(expression, vars), error: null as string | null }
    } catch (err) {
      return { value: null as number | null, error: err instanceof FormulaError ? err.message : 'Invalid expression' }
    }
  })()

  const canSave = label.trim() && key.trim() && section && expression.trim() && !preview?.error

  const handleSave = async () => {
    setSaving(true)
    await onCreate({ key: key.trim(), label: label.trim(), section, expression, input_variables: detectedVariables, output_unit: outputUnit })
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
      title="Add Formula"
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            Add Formula
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Label</label>
          <input value={label} onChange={(e) => handleLabelChange(e.target.value)} className={inputClass} placeholder="e.g. Net Margin" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Key (variable name other formulas can reference)</label>
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
              {sectionLabels.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {sectionLabels.length === 0 && <p className="mt-1 text-xs text-[var(--color-red)]">No sections yet — add one under "Manage Sections" first.</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Output Unit</label>
            <input value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} className={inputClass} placeholder="e.g. kg, INR, %" />
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Insert a variable</label>
              <select
                value={insertKey}
                onChange={(e) => {
                  if (e.target.value) insertToken(e.target.value)
                  setInsertKey('')
                }}
                className={inputClass}
              >
                <option value="">Pick a formula or field to insert...</option>
                {insertableKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
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
              placeholder="Pick a variable above, or type e.g. netOemPrice - totalDirectCost"
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
      </div>
    </Modal>
  )
}

function TechDataFieldSectionCard({
  title,
  fields,
  onEdit,
  onDelete,
}: {
  title: string
  fields: TechDataFieldDto[]
  onEdit: (field: TechDataFieldDto) => void
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
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" icon={<Pencil size={12} />} onClick={() => onEdit(f)}>
                      Edit
                    </Button>
                    {!f.is_core && (
                      <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => onDelete(f)}>
                        Delete
                      </Button>
                    )}
                  </div>
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

  const canSave =
    label.trim() && key.trim() && section && (fieldType !== 'select' || isAuto || optionsText.trim()) && (!isAuto || (expression.trim() && !preview?.error))

  const handleSave = async () => {
    setSaving(true)
    await onCreate({
      key: key.trim(),
      label: label.trim(),
      section,
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
            </select>
            {existingSections.length === 0 && <p className="mt-1 text-xs text-[var(--color-red)]">No sections yet — add one under "Manage Sections" first.</p>}
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

function EditTechDataFieldModal({
  field,
  existingSections,
  onClose,
  onSave,
}: {
  field: TechDataFieldDto | null
  existingSections: string[]
  onClose: () => void
  onSave: (patch: { label: string; section: string; unit: string; options: string[] }) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [section, setSection] = useState('')
  const [unit, setUnit] = useState('')
  const [optionsText, setOptionsText] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-seed local state whenever a different field is opened for editing.
  const [openedKey, setOpenedKey] = useState<string | null>(null)
  if (field && field.key !== openedKey) {
    setOpenedKey(field.key)
    setLabel(field.label)
    setSection(field.section)
    setUnit(field.unit)
    setOptionsText(field.options.join(', '))
  }

  if (!field) return null

  const isManualSelect = field.field_type === 'select' && !field.is_auto && !field.is_catalog_derived
  const canSave = label.trim() && section

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      label: label.trim(),
      section,
      unit,
      options: isManualSelect ? optionsText.split(',').map((o) => o.trim()).filter(Boolean) : field.options,
    })
    setSaving(false)
  }

  return (
    <Modal
      open={!!field}
      onClose={onClose}
      title={`Edit Field — ${field.key}`}
      width="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave || saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-ink-faint)]">
          Key (<code className="font-mono">{field.key}</code>) and Type (<span className="capitalize">{field.field_type}</span>) can&rsquo;t
          be changed after creation.
          {field.is_auto && (
            <>
              {' '}
              To change the formula, edit it in the table above under{' '}
              <span className="font-medium text-[var(--color-ink)]">Technical Data Sheet — Auto Fields</span>.
            </>
          )}
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Section</label>
            <select value={section} onChange={(e) => setSection(e.target.value)} className={inputClass}>
              {!existingSections.includes(section) && <option value={section}>{section}</option>}
              {existingSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
          </div>
        </div>
        {isManualSelect && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">Options (comma-separated)</label>
            <input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className={inputClass} />
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
  onDelete,
}: {
  title: string
  formulas: FormulaDefinitionDto[]
  sampleVars: Record<string, number>
  onSave: (key: string, expression: string) => Promise<void>
  onDelete: (formula: FormulaDefinitionDto) => void
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
              <FormulaRow key={f.key} formula={f} sampleVars={sampleVars} onSave={onSave} onDelete={onDelete} />
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
  onDelete,
}: {
  formula: FormulaDefinitionDto
  sampleVars: Record<string, number>
  onSave: (key: string, expression: string) => Promise<void>
  onDelete: (formula: FormulaDefinitionDto) => void
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
        <div className="flex gap-1.5">
          {dirty && (
            <>
              <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => setDraft(formula.expression)}>
                Reset
              </Button>
              <Button size="sm" variant="primary" icon={<Save size={12} />} onClick={handleSave} disabled={saving || !!candidate.error}>
                Save
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => onDelete(formula)} />
        </div>
      </td>
    </tr>
  )
}
