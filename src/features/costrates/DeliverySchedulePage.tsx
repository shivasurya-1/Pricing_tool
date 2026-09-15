import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { isTechDataFilled } from '@/components/pulley/PulleyTechDataForm'
import { formatDate } from '@/lib/format'
import {
  DELIVERY_ACTIVITIES,
  PHASES,
  MAX_GROUP_KEYS,
  SUM_GROUP_KEYS,
  ACTIVITY_TO_SRC_KEY,
  computeActivityDays,
  type DeliverySourcing,
  type DeliveryActivity,
} from '@/data/deliverySchedule'
import { PULLEY_COST_RATES } from '@/data/pulleyCostRates'
import type { RFQItem } from '@/types'

const SOURCING_OPTIONS: DeliverySourcing[] = ['In-house', 'Outsource', 'Logistics', '—']
const TONE: Record<DeliverySourcing, 'teal' | 'purple' | 'blue' | 'neutral'> = {
  'In-house': 'teal',
  Outsource: 'purple',
  Logistics: 'blue',
  '—': 'neutral',
}

interface RowState {
  sourcing: DeliverySourcing
  overrideDays: number | undefined
}

/** Seeds each activity from the item's real Sourcing-confirmed choice where a mapping
 * exists (ACTIVITY_TO_SRC_KEY); everything else keeps the workbook's generic default. */
function baselineStateForItem(item: RFQItem | undefined): Record<string, RowState> {
  return Object.fromEntries(
    DELIVERY_ACTIVITIES.map((a) => {
      const srcKey = ACTIVITY_TO_SRC_KEY[a.key]
      const realMode = srcKey ? item?.technicalData?.[srcKey] : undefined
      const sourcing = (realMode === 'In-house' || realMode === 'Outsource' || realMode === 'Logistics' ? realMode : a.sourcing) as DeliverySourcing
      return [a.key, { sourcing, overrideDays: a.overrideDays }]
    }),
  )
}

export function DeliverySchedulePage() {
  const navigate = useNavigate()
  const rfqs = useDataStore((s) => s.rfqs)
  const rfqsWithTechData = useMemo(() => rfqs.filter((r) => r.items.some((it) => isTechDataFilled(it.technicalData))), [rfqs])

  const [rfqId, setRfqId] = useState(rfqsWithTechData[0]?.id ?? '')
  const rfq = rfqs.find((r) => r.id === rfqId)
  const items = useMemo(() => (rfq ? rfq.items.filter((it) => isTechDataFilled(it.technicalData)) : []), [rfq])
  const [itemId, setItemId] = useState(items[0]?.id ?? '')
  const item = items.find((it) => it.id === itemId) ?? items[0]

  const [state, setState] = useState<Record<string, RowState>>(() => baselineStateForItem(item))

  useEffect(() => {
    setState(baselineStateForItem(item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  useEffect(() => {
    if (!items.some((it) => it.id === itemId)) setItemId(items[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId])

  const days = useMemo(() => {
    const out: Record<string, number> = {}
    for (const a of DELIVERY_ACTIVITIES) {
      const s = state[a.key]
      out[a.key] = computeActivityDays(s.sourcing, a.stdDays, s.overrideDays)
    }
    return out
  }, [state])

  const maxGroupDays = Math.max(0, ...MAX_GROUP_KEYS.map((k) => days[k] ?? 0))
  const sumGroupDays = SUM_GROUP_KEYS.reduce((sum, k) => sum + (days[k] ?? 0), 0)
  const totalCalendarDays = maxGroupDays + sumGroupDays
  const deliveryWeeks = (totalCalendarDays / 7) * PULLEY_COST_RATES.deliverySafetyFactor
  const expectedDispatchDate = new Date(Date.now() + totalCalendarDays * PULLEY_COST_RATES.deliverySafetyFactor * 86400000)

  const requiredDate = item ? new Date(item.requiredDelivery) : undefined
  const atRisk = requiredDate ? expectedDispatchDate.getTime() > requiredDate.getTime() : false

  const activitiesByPhase = (phase: string) => DELIVERY_ACTIVITIES.filter((a) => a.phase === phase)

  const updateRow = (key: string, patch: Partial<RowState>) => setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))

  return (
    <div>
      <PageHeader
        title="Delivery Schedule"
        description="Days from order to dispatch, computed for a real RFQ's actual Sourcing decisions — mirrors the client's Delivery Schedule tab."
        actions={
          <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setState(baselineStateForItem(item))}>
            Reset to RFQ's Sourcing
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="text-xs font-medium text-[var(--color-ink-soft)]">RFQ</label>
          <select
            value={rfqId}
            onChange={(e) => setRfqId(e.target.value)}
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
            <>
              <label className="text-xs font-medium text-[var(--color-ink-soft)]">Item</label>
              <select
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm"
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.productName}
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

      {!rfq || !item ? (
        <EmptyState
          title="No RFQ selected"
          description={
            rfqsWithTechData.length === 0
              ? 'No RFQ has captured technical data yet. Fill Technical Data on an item while creating an RFQ, then come back here.'
              : 'Pick an RFQ above to see its actual delivery schedule.'
          }
        />
      ) : (
        <>
          <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>
              Rows marked <Badge tone="green">From Sourcing</Badge> use this item's actual In-house/Outsource choice from the Sourcing
              screen. Everything else keeps the workbook's generic default — the source file doesn't give a per-process day count for
              those. Override Days only applies when a row is Outsourced. Phase 1 (body manufacturing) is tracked but excluded from the
              total — it runs in parallel, and Phase 3 procurement is the longer path.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Longest Procurement (Phase 3, parallel)" value={`${maxGroupDays} days`} />
            <SummaryStat label="Sum of Critical-Path Steps" value={`${sumGroupDays} days`} />
            <SummaryStat label="Total Calendar Days" value={`${totalCalendarDays} days`} bold />
            <SummaryStat label="Delivery Weeks (÷7 × safety factor)" value={`${deliveryWeeks.toFixed(1)} weeks`} bold />
          </div>

          <Card className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Expected Dispatch</p>
                <p className="mt-0.5 text-base font-semibold text-[var(--color-ink)]">{formatDate(expectedDispatchDate.toISOString())}</p>
              </div>
              {requiredDate && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Customer Required Delivery</p>
                  <p className="mt-0.5 text-base font-semibold text-[var(--color-ink)]">{formatDate(item.requiredDelivery)}</p>
                </div>
              )}
              {requiredDate && (
                <Badge tone={atRisk ? 'red' : 'green'}>{atRisk ? 'At risk — computed dispatch is after the required date' : 'On track for required delivery'}</Badge>
              )}
            </div>
          </Card>

          <div className="space-y-5">
            {PHASES.map((phase) => (
              <Card key={phase}>
                <CardHeader title={phase} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
                        <th className="px-4 py-2">Process / Activity</th>
                        <th className="px-4 py-2">Sourcing</th>
                        <th className="px-4 py-2 text-right">Std. Days</th>
                        <th className="px-4 py-2 text-right">Override Days</th>
                        <th className="px-4 py-2 text-right">Days (computed)</th>
                        <th className="px-4 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitiesByPhase(phase).map((a: DeliveryActivity) => {
                        const s = state[a.key]
                        const inMaxGroup = MAX_GROUP_KEYS.includes(a.key)
                        const inSumGroup = SUM_GROUP_KEYS.includes(a.key)
                        const fromSourcing = a.key in ACTIVITY_TO_SRC_KEY
                        return (
                          <tr key={a.key} className={clsx('border-b border-[var(--color-border)] last:border-0', fromSourcing && 'bg-[var(--color-green-50)]')}>
                            <td className="px-4 py-2.5 font-medium">
                              {a.label}
                              {fromSourcing && <Badge tone="green" className="ml-2">From Sourcing</Badge>}
                              {(inMaxGroup || inSumGroup) && (
                                <Badge tone={inMaxGroup ? 'purple' : 'blue'} className="ml-2">
                                  {inMaxGroup ? 'Parallel' : 'Critical path'}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <select
                                value={s.sourcing}
                                onChange={(e) => updateRow(a.key, { sourcing: e.target.value as DeliverySourcing })}
                                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs outline-none focus:border-[var(--color-blue)]"
                              >
                                {SOURCING_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              <Badge tone={TONE[s.sourcing]} className="ml-1.5">
                                {s.sourcing}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right text-[var(--color-ink-faint)]">
                              {a.stdDays} {a.unit}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <input
                                type="number"
                                value={s.overrideDays ?? ''}
                                onChange={(e) => updateRow(a.key, { overrideDays: e.target.value === '' ? undefined : Number(e.target.value) })}
                                className="w-20 rounded-md border border-[var(--color-border)] px-2 py-1 text-right text-xs outline-none focus:border-[var(--color-blue)]"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold">{days[a.key]} days</td>
                            <td className="px-4 py-2.5 text-xs text-[var(--color-ink-faint)]">{a.note}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryStat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--color-ink-faint)]">{label}</p>
      <p className={bold ? 'mt-1.5 text-xl font-bold text-[var(--color-ink)]' : 'mt-1.5 text-lg font-semibold text-[var(--color-ink)]'}>{value}</p>
    </Card>
  )
}
