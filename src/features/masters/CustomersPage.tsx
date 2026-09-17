import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { formatDate } from '@/lib/format'
import type { Customer } from '@/types'

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-blue)]'

export function CustomersPage() {
  const customers = useDataStore((s) => s.customers)
  const upsertCustomer = useDataStore((s) => s.upsertCustomer)
  const pushToast = useUiStore((s) => s.pushToast)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openNew = () => {
    setEditing({
      id: '',
      code: `CUST-${String(customers.length + 1).padStart(3, '0')}`,
      name: '',
      contact: '',
      email: '',
      phone: '',
      city: '',
      taxId: '',
      paymentTerms: 'Net 30',
      status: 'Active',
      updatedAt: new Date().toISOString(),
    })
    setDrawerOpen(true)
  }

  const columns: Column<Customer>[] = [
    { key: 'code', header: 'Customer Code', render: (c) => c.code },
    { key: 'name', header: 'Customer Name', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'contact', header: 'Contact', render: (c) => c.contact },
    { key: 'email', header: 'Email', render: (c) => c.email },
    { key: 'phone', header: 'Phone', render: (c) => c.phone },
    { key: 'city', header: 'City', render: (c) => c.city },
    { key: 'taxId', header: 'GST/Tax ID', render: (c) => c.taxId },
    { key: 'terms', header: 'Payment Terms', render: (c) => c.paymentTerms },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'Active' ? 'green' : 'neutral'}>{c.status}</Badge> },
    { key: 'updated', header: 'Last Updated', render: (c) => formatDate(c.updatedAt) },
    {
      key: 'action',
      header: 'Action',
      render: (c) => (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(c)
              setDrawerOpen(true)
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              upsertCustomer({ ...c, status: c.status === 'Active' ? 'Inactive' : 'Active', updatedAt: new Date().toISOString() })
              pushToast(`${c.name} ${c.status === 'Active' ? 'deactivated' : 'activated'}.`, 'success')
            }}
          >
            {c.status === 'Active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${customers.length} customers`}
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={openNew}>
            Add Customer
          </Button>
        }
      />
      <Card>
        <DataTable columns={columns} rows={customers} keyField={(c) => c.id} />
      </Card>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editing?.name ? `Edit ${editing.name}` : 'New Customer'}>
        {editing && (
          <div className="space-y-3">
            <LabeledInput label="Customer Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <LabeledInput label="Customer Code" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
            <LabeledInput label="Contact Person" value={editing.contact} onChange={(v) => setEditing({ ...editing, contact: v })} />
            <LabeledInput label="Email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} />
            <LabeledInput label="Phone" value={editing.phone} onChange={(v) => setEditing({ ...editing, phone: v })} />
            <LabeledInput label="City" value={editing.city} onChange={(v) => setEditing({ ...editing, city: v })} />
            <LabeledInput label="GST / Tax ID" value={editing.taxId} onChange={(v) => setEditing({ ...editing, taxId: v })} />
            <LabeledInput label="Payment Terms" value={editing.paymentTerms} onChange={(v) => setEditing({ ...editing, paymentTerms: v })} />
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                upsertCustomer({ ...editing, updatedAt: new Date().toISOString() })
                pushToast('Customer saved.', 'success')
                setDrawerOpen(false)
              }}
            >
              Save Customer
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
