import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'

interface Hit {
  type: 'RFQ' | 'Quotation' | 'Customer' | 'Product'
  label: string
  sub: string
  to: string
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const rfqs = useDataStore((s) => s.rfqs)
  const quotations = useDataStore((s) => s.quotations)
  const customers = useDataStore((s) => s.customers)
  const products = useDataStore((s) => s.products)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: Hit[] = []

    rfqs.forEach((r) => {
      if (r.rfqNumber.toLowerCase().includes(q) || r.endCustomer.toLowerCase().includes(q) || r.projectName.toLowerCase().includes(q)) {
        out.push({ type: 'RFQ', label: r.rfqNumber, sub: `${r.endCustomer} · ${r.projectName}`, to: `/rfqs/${r.id}` })
      }
    })
    quotations.forEach((qt) => {
      if (qt.quotationNumber.toLowerCase().includes(q) || qt.customerName.toLowerCase().includes(q)) {
        out.push({ type: 'Quotation', label: qt.quotationNumber, sub: `${qt.customerName} · ${qt.projectName}`, to: `/quotations/${qt.id}` })
      }
    })
    customers.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) {
        out.push({ type: 'Customer', label: c.name, sub: c.code, to: `/customers` })
      }
    })
    products.forEach((p) => {
      if (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) {
        out.push({ type: 'Product', label: p.name, sub: p.code, to: `/products` })
      }
    })
    return out.slice(0, 8)
  }, [query, rfqs, quotations, customers, products])

  return (
    <div ref={ref} className="relative w-full max-w-md" data-tour="global-search">
      <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
        <Search size={15} className="text-[var(--color-ink-faint)]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search RFQ, customer, product, quotation..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
        />
      </div>
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)] bg-white shadow-lg">
          {hits.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                navigate(h.to)
                setOpen(false)
                setQuery('')
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface)]"
            >
              <span>
                <span className="font-medium text-[var(--color-ink)]">{h.label}</span>
                <span className="ml-2 text-xs text-[var(--color-ink-faint)]">{h.sub}</span>
              </span>
              <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-faint)]">
                {h.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
