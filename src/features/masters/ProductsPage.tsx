import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { ApiError } from '@/lib/apiClient'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Tabs } from '@/components/ui/Tabs'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatCurrency } from '@/lib/format'
import type { Product, SourcingType } from '@/types'

const PRODUCT_TABS = ['Basic Information', 'Pricing', 'Sourcing', 'History']

const SOURCING_TONE = { 'In-House': 'teal', 'Out-House': 'purple', Both: 'blue' } as const
const SOURCING_TYPES: SourcingType[] = ['In-House', 'Out-House', 'Both']

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'
const labelClass = 'mb-1 block text-xs font-medium text-[var(--color-ink-soft)]'

function emptyProduct(): Product {
  return {
    id: '',
    code: '',
    name: '',
    category: '',
    unit: 'Nos',
    description: '',
    defaultLeadTimeDays: 0,
    basePrice: 0,
    status: 'Active',
    technicalData: {},
    preferredVendorIds: [],
    sourcingType: 'Both',
  }
}

export function ProductsPage() {
  const products = useDataStore((s) => s.products)
  const vendors = useDataStore((s) => s.vendors)
  const inHouseCapabilities = useDataStore((s) => s.inHouseCapabilities)
  const auditLog = useDataStore((s) => s.auditLog)
  const upsertProduct = useDataStore((s) => s.upsertProduct)
  const deleteProduct = useDataStore((s) => s.deleteProduct)
  const pushToast = useUiStore((s) => s.pushToast)

  const [selected, setSelected] = useState<Product | null>(null)
  const [tab, setTab] = useState('Basic Information')
  const [editing, setEditing] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

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
        <div className="flex gap-1.5">
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
          <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  const productAudit = selected ? auditLog.filter((a) => a.record.includes(selected.code) || a.action.includes(selected.name)) : []

  const saveEditing = async () => {
    if (!editing) return
    if (!editing.code.trim() || !editing.name.trim()) {
      pushToast('Product code and name are required.', 'error')
      return
    }
    setSaving(true)
    try {
      await upsertProduct(editing)
      pushToast('Product saved.', 'success')
      setEditing(null)
    } catch {
      // Error toast already shown by the store.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Products / Materials"
        description={`${products.length} products in the catalog`}
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing(emptyProduct())}>
            Add Product
          </Button>
        }
      />
      <Card>
        <DataTable columns={columns} rows={products} keyField={(p) => p.id} />
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

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name || editing.code}` : 'New Product'}>
        {editing && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                Product Code <span className="text-[var(--color-red)]">*</span>
              </label>
              <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>
                Product Name <span className="text-[var(--color-red)]">*</span>
              </label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Category</label>
                <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Unit</label>
                <input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputClass} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Base Price</label>
                <input
                  type="number"
                  value={editing.basePrice}
                  onChange={(e) => setEditing({ ...editing, basePrice: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Default Lead Time (days)</label>
                <input
                  type="number"
                  value={editing.defaultLeadTimeDays}
                  onChange={(e) => setEditing({ ...editing, defaultLeadTimeDays: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Sourcing Type</label>
                <select
                  value={editing.sourcingType}
                  onChange={(e) => setEditing({ ...editing, sourcingType: e.target.value as SourcingType })}
                  className={inputClass}
                >
                  {SOURCING_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as Product['status'] })}
                  className={inputClass}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <Button variant="primary" className="w-full" disabled={saving} onClick={saveEditing}>
              {saving ? 'Saving...' : 'Save Product'}
            </Button>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteProduct(deleteTarget.id)
            pushToast(`${deleteTarget.name} deleted.`, 'success')
          } catch (err) {
            pushToast(err instanceof ApiError ? err.message : 'Failed to delete product.', 'error')
          }
        }}
        title="Delete Product"
        description={`Delete "${deleteTarget?.name}"? This can't be undone. Products still used by an RFQ item can't be deleted.`}
        confirmLabel="Delete"
        danger
      />
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
