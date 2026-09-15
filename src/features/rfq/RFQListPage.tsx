import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Download } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import { PriorityBadge } from '@/components/PriorityBadge'
import { formatCurrency, formatDate } from '@/lib/format'
import type { RFQ } from '@/types'
import { useUiStore } from '@/store/uiStore'

export function RFQListPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const rfqs = useDataStore((s) => s.rfqs)
  const pushToast = useUiStore((s) => s.pushToast)

  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>(params.get('stage') ?? '')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')

  const customers = useMemo(() => [...new Set(rfqs.map((r) => r.endCustomer))].sort(), [rfqs])
  const stages = useMemo(() => [...new Set(rfqs.map((r) => r.stage))], [rfqs])

  const filtered = rfqs.filter((r) => {
    if (search && !`${r.rfqNumber} ${r.endCustomer} ${r.projectName}`.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter && r.stage !== stageFilter) return false
    if (priorityFilter && r.priority !== priorityFilter) return false
    if (customerFilter && r.endCustomer !== customerFilter) return false
    return true
  })

  const columns: Column<RFQ>[] = [
    { key: 'rfqNumber', header: 'RFQ Number', render: (r) => <span className="font-medium text-[var(--color-blue)]">{r.rfqNumber}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.endCustomer },
    { key: 'project', header: 'Project', render: (r) => r.projectName },
    { key: 'salesPerson', header: 'Sales Person', render: (r) => r.salesPerson },
    { key: 'rfqDate', header: 'RFQ Date', render: (r) => formatDate(r.rfqReceivedDate) },
    { key: 'delivery', header: 'Required Delivery', render: (r) => formatDate(r.requiredDeliveryDate) },
    { key: 'items', header: 'Items', align: 'center', render: (r) => r.items.length },
    { key: 'value', header: 'Value', align: 'right', render: (r) => formatCurrency(r.value, r.currency) },
    { key: 'stage', header: 'Stage', render: (r) => <StatusBadge stage={r.stage} /> },
    { key: 'priority', header: 'Priority', render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: 'updated', header: 'Last Updated', render: (r) => formatDate(r.updatedAt) },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`/rfqs/${r.id}`)}>
          View
        </Button>
      ),
    },
  ]

  const clearFilters = () => {
    setSearch('')
    setStageFilter('')
    setPriorityFilter('')
    setCustomerFilter('')
  }

  return (
    <div>
      <PageHeader
        title="RFQs"
        description={`${filtered.length} of ${rfqs.length} RFQs`}
        actions={
          <>
            <Button variant="secondary" icon={<Download size={15} />} onClick={() => pushToast('RFQ list exported (mock).', 'success')}>
              Export
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/rfqs/new')} data-tour="primary-action">
              Create RFQ
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RFQ, customer, project..."
            className="min-w-[220px] flex-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]"
          />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Stages</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Priorities</option>
            {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-sm">
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {(search || stageFilter || priorityFilter || customerFilter) && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear Filters
            </Button>
          )}
        </div>

        <DataTable
          columns={columns}
          rows={filtered}
          keyField={(r) => r.id}
          onRowClick={(r) => navigate(`/rfqs/${r.id}`)}
          emptyTitle="No RFQs found"
          emptyDescription="Try changing your filters or create a new RFQ."
          emptyAction={
            <>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
              <Button size="sm" variant="primary" onClick={() => navigate('/rfqs/new')}>
                Create RFQ
              </Button>
            </>
          }
        />
      </Card>
    </div>
  )
}
