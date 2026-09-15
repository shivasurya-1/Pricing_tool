import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RefreshCw, Save, FileSpreadsheet } from 'lucide-react'
import clsx from 'clsx'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SendBackModal } from '@/components/workflow/SendBackModal'
import { PulleyTechDataView } from '@/components/pulley/PulleyTechDataView'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { formatCurrency } from '@/lib/format'
import { SEND_BACK_TARGETS } from '@/lib/workflow'
import { calculateCostBreakdown, marginStatus, marginStatusColor, summarizeCostBreakdown } from '@/lib/pricing'
import { computePulleyPricing } from '@/lib/pulleyPricingCalc'
import { useFormulaStore } from '@/store/formulaStore'
import type { CostBreakdownLine, RFQItem } from '@/types'

interface EditableLine {
  itemId: string
  baseCost: number
  freight: number
  duties: number
  otherCharges: number
  discount: number
  marginPercent: number
  taxPercent: number
}

export function ControllingScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const saveCostBreakdown = useDataStore((s) => s.saveCostBreakdown)
  const submitControlling = useDataStore((s) => s.submitControlling)
  const sendBack = useDataStore((s) => s.sendBack)
  const name = useAuthStore((s) => s.name)
  const pushToast = useUiStore((s) => s.pushToast)

  const rfq = rfqs.find((r) => r.id === id)
  // Subscribed so a formula saved on the Formulas page is picked up next time this
  // page's base cost is (re)computed — e.g. by clicking "Recalculate" below.
  const formulas = useFormulaStore((s) => s.formulas)
  const costRates = useFormulaStore((s) => s.costRates)

  const initialLines: EditableLine[] = useMemo(() => {
    if (!rfq) return []
    if (rfq.costBreakdown.length > 0) {
      return rfq.costBreakdown.map((l) => ({
        itemId: l.itemId,
        baseCost: l.baseCost,
        freight: l.freight,
        duties: l.duties,
        otherCharges: l.otherCharges,
        discount: l.discount,
        marginPercent: l.marginPercent,
        taxPercent: l.taxPercent,
      }))
    }
    return rfq.items.map((item) => {
      const baseCost = computePulleyPricing(item.technicalData ?? {}).totalDirectCost
      return {
        itemId: item.id,
        baseCost,
        freight: Math.round(baseCost * 0.02),
        duties: Math.round(baseCost * 0.05),
        otherCharges: Math.round(baseCost * 0.01),
        discount: 0,
        marginPercent: rfq.targetMarginPercent,
        taxPercent: 18,
      }
    })
  }, [rfq, formulas, costRates])

  const [lines, setLines] = useState<EditableLine[]>(initialLines)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [techDataItem, setTechDataItem] = useState<RFQItem | null>(null)
  const [confirmLowMargin, setConfirmLowMargin] = useState(false)

  if (!rfq) return <EmptyState title="RFQ not found" />
  if (rfq.stage !== 'Controlling') {
    return <EmptyState title="This RFQ is not awaiting Controlling" description={`Current stage: ${rfq.stage}`} action={<Button onClick={() => navigate(`/rfqs/${rfq.id}`)}>View RFQ</Button>} />
  }

  const updateLine = (itemId: string, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)))
  }

  const computed: CostBreakdownLine[] = lines.map((l) => calculateCostBreakdown(l))
  const summary = summarizeCostBreakdown(computed)
  const status = marginStatus(summary.marginPercent, rfq.targetMarginPercent)

  const persist = () => {
    saveCostBreakdown(rfq.id, computed)
  }

  const handleSubmit = () => {
    persist()
    if (status === 'below') {
      setConfirmLowMargin(true)
      return
    }
    submitControlling(rfq.id, name)
    pushToast('Commercial pricing submitted for approval.', 'success')
    navigate('/rfqs')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'RFQs', to: '/rfqs' }, { label: rfq.rfqNumber, to: `/rfqs/${rfq.id}` }, { label: 'Controlling' }]}
        title={`Commercial Pricing — ${rfq.rfqNumber}`}
        description={`${rfq.endCustomer} · ${rfq.projectName} · Target margin ${rfq.targetMarginPercent}%`}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Cost Breakdown" action={
            <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={() => setLines(initialLines)}>
              Recalculate
            </Button>
          } />
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left uppercase text-[var(--color-ink-faint)]">
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2 text-right">Base Cost</th>
                  <th className="px-2 py-2 text-right">Freight</th>
                  <th className="px-2 py-2 text-right">Duties</th>
                  <th className="px-2 py-2 text-right">Other</th>
                  <th className="px-2 py-2 text-right">Discount</th>
                  <th className="px-2 py-2 text-right">Adjusted Cost</th>
                  <th className="px-2 py-2 text-right">Margin %</th>
                  <th className="px-2 py-2 text-right">Selling Price</th>
                  <th className="px-2 py-2 text-right">Tax %</th>
                  <th className="px-2 py-2 text-right">Final Price</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const item = rfq.items.find((it) => it.id === line.itemId)
                  const c = computed[i]
                  return (
                    <tr key={line.itemId} className="border-b border-[var(--color-border)]">
                      <td className="px-2 py-2 font-medium">
                        <button
                          onClick={() => item && setTechDataItem(item)}
                          disabled={!item || !isTechDataFilled(item.technicalData)}
                          className="inline-flex items-center gap-1 hover:text-[var(--color-orange)] disabled:cursor-default disabled:hover:text-[var(--color-ink)]"
                          title="View technical data"
                        >
                          {item?.productName}
                          <FileSpreadsheet size={12} className="text-[var(--color-ink-faint)]" />
                        </button>
                      </td>
                      <td className="px-2 py-2 text-right">{formatCurrency(line.baseCost)}</td>
                      <td className="px-2 py-2">
                        <NumInput value={line.freight} onChange={(v) => updateLine(line.itemId, { freight: v })} />
                      </td>
                      <td className="px-2 py-2">
                        <NumInput value={line.duties} onChange={(v) => updateLine(line.itemId, { duties: v })} />
                      </td>
                      <td className="px-2 py-2">
                        <NumInput value={line.otherCharges} onChange={(v) => updateLine(line.itemId, { otherCharges: v })} />
                      </td>
                      <td className="px-2 py-2">
                        <NumInput value={line.discount} onChange={(v) => updateLine(line.itemId, { discount: v })} />
                      </td>
                      <td className="px-2 py-2 text-right font-medium">{formatCurrency(c.adjustedCost)}</td>
                      <td className="px-2 py-2">
                        <NumInput value={line.marginPercent} onChange={(v) => updateLine(line.itemId, { marginPercent: v })} suffix="%" width="w-16" />
                      </td>
                      <td className="px-2 py-2 text-right">{formatCurrency(c.sellingPrice)}</td>
                      <td className="px-2 py-2">
                        <NumInput value={line.taxPercent} onChange={(v) => updateLine(line.itemId, { taxPercent: v })} suffix="%" width="w-14" />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{formatCurrency(c.finalPrice)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pricing Summary" />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Stat label="Total Cost" value={formatCurrency(summary.totalCost)} />
            <Stat label="Total Selling Price" value={formatCurrency(summary.totalSellingPrice)} />
            <Stat label="Gross Margin" value={formatCurrency(summary.grossMargin)} />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Margin %</p>
              <p className={clsx('mt-1 inline-block rounded border px-2 py-0.5 text-sm font-semibold', marginStatusColor[status])}>
                {summary.marginPercent.toFixed(1)}% <span className="font-normal">(target {rfq.targetMarginPercent}%)</span>
              </p>
            </div>
            <Stat label="Tax" value={formatCurrency(summary.totalTax)} />
            <Stat label="Freight" value={formatCurrency(summary.totalFreight)} />
            <Stat label="Discount" value={formatCurrency(summary.totalDiscount)} />
            <Stat label="Grand Total" value={formatCurrency(summary.grandTotal)} bold />
          </div>
          {status !== 'healthy' && (
            <div
              className={clsx(
                'mx-4 mb-4 rounded-md border px-3 py-2 text-xs font-medium',
                status === 'warning' ? 'border-[var(--color-amber-100)] bg-[var(--color-amber-50)] text-[var(--color-amber)]' : 'border-[var(--color-red-100)] bg-[var(--color-red-50)] text-[var(--color-red)]',
              )}
            >
              Margin is {status === 'warning' ? 'below target' : 'well below target'} ({summary.marginPercent.toFixed(1)}% vs {rfq.targetMarginPercent}% target).
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-border)] p-4">
            <Button variant="secondary" icon={<Save size={14} />} onClick={() => { persist(); pushToast('Calculation saved.', 'success') }}>
              Save Calculation
            </Button>
            <Button variant="secondary" onClick={() => setSendBackOpen(true)}>
              Send Back
            </Button>
            <Button variant="primary" onClick={handleSubmit}>
              Submit for Approval
            </Button>
          </div>
        </Card>
      </div>

      <SendBackModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        targets={SEND_BACK_TARGETS['Controlling'] ?? []}
        onConfirm={(target, c) => {
          persist()
          sendBack(rfq.id, target, 'Controlling', name, c)
          pushToast(`${rfq.rfqNumber} sent back with comments.`, 'warning')
          navigate('/rfqs')
        }}
      />

      <ConfirmDialog
        open={confirmLowMargin}
        onClose={() => setConfirmLowMargin(false)}
        onConfirm={() => {
          submitControlling(rfq.id, name)
          pushToast('Submitted for approval despite low margin.', 'warning')
          navigate('/rfqs')
        }}
        title="Margin below target"
        description={`Current margin is ${summary.marginPercent.toFixed(1)}%, below the ${rfq.targetMarginPercent}% target for this category. Submit for approval anyway?`}
        confirmLabel="Submit Anyway"
        danger
      />

      <Drawer open={!!techDataItem} onClose={() => setTechDataItem(null)} title={`Technical Data — ${techDataItem?.productName ?? ''}`} width="max-w-2xl">
        <PulleyTechDataView values={techDataItem?.technicalData} />
      </Drawer>
    </div>
  )
}

function NumInput({ value, onChange, suffix, width = 'w-24' }: { value: number; onChange: (v: number) => void; suffix?: string; width?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx('rounded border border-[var(--color-border)] px-2 py-1 text-right text-xs outline-none focus:border-[var(--color-orange)]', width)}
      />
      {suffix && <span className="ml-0.5 text-[var(--color-ink-faint)]">{suffix}</span>}
    </div>
  )
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className={clsx('mt-0.5 text-sm', bold ? 'text-base font-bold text-[var(--color-ink)]' : 'font-semibold text-[var(--color-ink)]')}>{value}</p>
    </div>
  )
}
