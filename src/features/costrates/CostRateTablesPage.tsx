import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ReferenceCrudTable, type ReferenceColumn } from '@/components/reference/ReferenceCrudTable'
import { useFormulaStore, type CostRateValueDto } from '@/store/formulaStore'
import { useReferenceStore, type LaggingCatalogDto } from '@/store/referenceStore'
import { formatCurrency } from '@/lib/format'

const rateColumns: ReferenceColumn<CostRateValueDto>[] = [
  { key: 'label', header: 'Parameter', type: 'text', required: true },
  { key: 'key', header: 'Key', type: 'text', required: true },
  { key: 'value', header: 'Value', type: 'number', required: true, editable: true },
  { key: 'unit', header: 'Unit', type: 'text' },
]

const laggingColumns: ReferenceColumn<LaggingCatalogDto>[] = [
  { key: 'lagging_type', header: 'Lagging Type', type: 'text', required: true },
  { key: 'thickness_mm', header: 'Thickness (mm)', type: 'number', required: true },
  { key: 'price_inr_per_m2', header: 'INR/m²', type: 'number', required: true, format: (r) => formatCurrency(r.price_inr_per_m2) },
  { key: 'delivery_days', header: 'Lead Time (days)', type: 'number', required: true },
]

const CATEGORY_SECTIONS: { category: string; title: string; description?: string }[] = [
  { category: 'Global', title: 'A. Global Parameters' },
  { category: 'Material', title: 'B. Material Rates', description: 'INR/kg — same figures as Raw Forging Prices, kept in sync' },
  { category: 'Labour', title: 'C. Machining & Labour Rates', description: 'INR/hour unless noted' },
  { category: 'Logistics', title: 'E. Logistics & Packing Rates' },
]

export function CostRateTablesPage() {
  const { costRatesFull, createCostRate, updateCostRate, deleteCostRate } = useFormulaStore()
  const { lagging, createLagging, deleteLagging } = useReferenceStore()

  const byCategory = useMemo(() => {
    const grouped: Record<string, CostRateValueDto[]> = {}
    for (const r of costRatesFull) {
      grouped[r.category] = grouped[r.category] ?? []
      grouped[r.category].push(r)
    }
    for (const list of Object.values(grouped)) list.sort((a, b) => a.order - b.order)
    return grouped
  }, [costRatesFull])

  return (
    <div>
      <PageHeader title="Cost Rate Tables" description="The rate card behind the Pricing Tool — every calculation reads live from these values." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Add, edit, or delete a rate here and every Pricing Tool calculation picks it up immediately.</p>
      </div>

      <div className="space-y-5">
        {CATEGORY_SECTIONS.map((section) => (
          <ReferenceCrudTable
            key={section.category}
            title={section.title}
            description={section.description}
            rows={byCategory[section.category] ?? []}
            columns={rateColumns}
            addLabel="Add Rate"
            onCreate={(v) =>
              createCostRate({
                key: String(v.key ?? ''),
                label: String(v.label ?? ''),
                category: section.category,
                value: Number(v.value ?? 0),
                unit: String(v.unit ?? ''),
                order: byCategory[section.category]?.length ?? 0,
              })
            }
            onUpdate={(id, patch) => updateCostRate(id, patch)}
            onDelete={deleteCostRate}
          />
        ))}

        <ReferenceCrudTable
          title="D. Lagging Rates"
          description="INR/m²"
          rows={lagging}
          columns={laggingColumns}
          addLabel="Add Lagging Rate"
          onCreate={(v) =>
            createLagging({
              lagging_type: String(v.lagging_type ?? ''),
              thickness_mm: Number(v.thickness_mm ?? 0),
              price_inr_per_m2: Number(v.price_inr_per_m2 ?? 0),
              delivery_days: Number(v.delivery_days ?? 0),
              description: '',
            })
          }
          onDelete={deleteLagging}
        />
      </div>
    </div>
  )
}
