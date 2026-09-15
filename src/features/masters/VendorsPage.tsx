import { useState } from 'react'
import { Plus, Star } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import type { Vendor } from '@/types'
import { uid } from '@/lib/id'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'

export function VendorsPage() {
  const vendors = useDataStore((s) => s.vendors)
  const upsertVendor = useDataStore((s) => s.upsertVendor)
  const pushToast = useUiStore((s) => s.pushToast)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openNew = () => {
    setEditing({
      id: uid('vend'),
      code: `VND-${String(vendors.length + 1).padStart(3, '0')}`,
      name: '',
      category: '',
      contact: '',
      email: '',
      rating: 4,
      paymentTerms: 'Net 30',
      status: 'Active',
    })
    setDrawerOpen(true)
  }

  const columns: Column<Vendor>[] = [
    { key: 'code', header: 'Vendor Code', render: (v) => v.code },
    { key: 'name', header: 'Vendor Name', render: (v) => <span className="font-medium">{v.name}</span> },
    { key: 'category', header: 'Category', render: (v) => v.category },
    { key: 'contact', header: 'Contact', render: (v) => v.contact },
    { key: 'email', header: 'Email', render: (v) => v.email },
    {
      key: 'rating',
      header: 'Rating',
      render: (v) => (
        <span className="flex items-center gap-1 text-[var(--color-amber)]">
          <Star size={13} fill="currentColor" /> {v.rating.toFixed(1)}
        </span>
      ),
    },
    { key: 'terms', header: 'Payment Terms', render: (v) => v.paymentTerms },
    { key: 'status', header: 'Status', render: (v) => <Badge tone={v.status === 'Active' ? 'green' : 'neutral'}>{v.status}</Badge> },
    {
      key: 'action',
      header: 'Action',
      render: (v) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(v)
            setDrawerOpen(true)
          }}
        >
          Edit
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Vendors"
        description={`${vendors.length} vendors`}
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={openNew}>
            Add Vendor
          </Button>
        }
      />
      <Card>
        <DataTable columns={columns} rows={vendors} keyField={(v) => v.id} />
      </Card>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing?.name ? `Edit ${editing.name}` : 'New Vendor'}>
        {editing && (
          <div className="space-y-3">
            <LabeledInput label="Vendor Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <LabeledInput label="Vendor Code" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
            <LabeledInput label="Category" value={editing.category} onChange={(v) => setEditing({ ...editing, category: v })} />
            <LabeledInput label="Contact" value={editing.contact} onChange={(v) => setEditing({ ...editing, contact: v })} />
            <LabeledInput label="Email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} />
            <LabeledInput label="Payment Terms" value={editing.paymentTerms} onChange={(v) => setEditing({ ...editing, paymentTerms: v })} />
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                upsertVendor(editing)
                pushToast('Vendor saved.', 'success')
                setDrawerOpen(false)
              }}
            >
              Save Vendor
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--color-ink-soft)]">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  )
}
