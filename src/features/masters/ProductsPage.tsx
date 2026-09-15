import { useState } from 'react'
import { useDataStore } from '@/store/dataStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Tabs } from '@/components/ui/Tabs'
import { formatCurrency } from '@/lib/format'
import type { Product } from '@/types'

const PRODUCT_TABS = ['Basic Information', 'Pricing', 'Sourcing', 'History']

const SOURCING_TONE = { 'In-House': 'teal', 'Out-House': 'purple', Both: 'blue' } as const

export function ProductsPage() {
  const products = useDataStore((s) => s.products)
  const vendors = useDataStore((s) => s.vendors)
  const inHouseCapabilities = useDataStore((s) => s.inHouseCapabilities)
  const auditLog = useDataStore((s) => s.auditLog)
  const [selected, setSelected] = useState<Product | null>(null)
  const [tab, setTab] = useState('Basic Information')

  const columns: Column<Product>[] = [
    { key: 'code', header: 'Product Code', render: (p) => p.code },
    { key: 'name', header: 'Product Name', render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'category', header: 'Category', render: (p) => p.category },
    { key: 'unit', header: 'Unit', render: (p) => p.unit },
    { key: 'sourcingType', header: 'Sourcing', render: (p) => <Badge tone={SOURCING_TONE[p.sourcingType]}>{p.sourcingType}</Badge> },
    { key: 'leadTime', header: 'Default Lead Time', render: (p) => `${p.defaultLeadTimeDays} days` },
    { key: 'basePrice', header: 'Base Price', align: 'right', render: (p) => formatCurrency(p.basePrice) },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'Active' ? 'green' : 'neutral'}>{p.status}</Badge> },
    {
      key: 'action',
      header: 'Action',
      render: (p) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setSelected(p)
            setTab('Basic Information')
          }}
        >
          View
        </Button>
      ),
    },
  ]

  const productAudit = selected ? auditLog.filter((a) => a.record.includes(selected.code) || a.action.includes(selected.name)) : []

  return (
    <div>
      <PageHeader title="Products / Materials" description={`${products.length} products in the catalog`} />
      <Card>
        <DataTable columns={columns} rows={products} keyField={(p) => p.id} onRowClick={(p) => { setSelected(p); setTab('Basic Information') }} />
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} width="max-w-2xl">
        {selected && (
          <div>
            <Tabs tabs={PRODUCT_TABS} active={tab} onChange={setTab} />
            <div className="pt-4">
              {tab === 'Basic Information' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Product Code" value={selected.code} />
                  <Info label="Category" value={selected.category} />
                  <Info label="Unit" value={selected.unit} />
                  <Info label="Default Lead Time" value={`${selected.defaultLeadTimeDays} days`} />
                  <Info label="Sourcing Type" value={selected.sourcingType} />
                  <Info label="Status" value={selected.status} />
                  <div className="col-span-2">
                    <Info label="Description" value={selected.description} />
                  </div>
                  <p className="col-span-2 text-xs text-[var(--color-ink-faint)]">
                    Full technical specification is captured per RFQ item on the Technical Data Sheet, not stored on the catalog entry.
                  </p>
                </div>
              )}
              {tab === 'Pricing' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Base Price" value={formatCurrency(selected.basePrice)} />
                  <Info label="Currency" value="INR" />
                </div>
              )}
              {tab === 'Sourcing' && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--color-ink-soft)]">
                      Eligibility: <Badge tone={SOURCING_TONE[selected.sourcingType]}>{selected.sourcingType}</Badge>
                    </p>
                  </div>
                  {selected.sourcingType !== 'Out-House' && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">In-House Capability</p>
                      {inHouseCapabilities
                        .filter((c) => c.category === selected.category)
                        .map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-[var(--color-ink-faint)]">
                              {c.capacityPerMonth}/mo · {c.leadTimeDays}d lead time
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                  {selected.sourcingType !== 'In-House' && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Preferred Vendors</p>
                      <div className="space-y-2">
                        {selected.preferredVendorIds.map((vid) => {
                          const v = vendors.find((x) => x.id === vid)
                          if (!v) return null
                          return (
                            <div key={vid} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                              <span className="font-medium">{v.name}</span>
                              <span className="text-xs text-[var(--color-ink-faint)]">{v.category}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab === 'History' && (
                <div className="space-y-2 text-sm">
                  {productAudit.length === 0 ? (
                    <p className="text-[var(--color-ink-faint)]">No historical changes recorded for this product yet.</p>
                  ) : (
                    productAudit.map((a) => (
                      <div key={a.id} className="border-b border-[var(--color-border)] pb-2">
                        {a.action}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-0.5 font-medium text-[var(--color-ink)]">{value}</p>
    </div>
  )
}
