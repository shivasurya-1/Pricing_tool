import { useMemo, useState } from 'react'
import { Info, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { BRG_CATALOG, SLEEVE_CATALOG, HOUSING_CATALOG } from '@/data/pulleyCatalogs'
import { formatCurrency } from '@/lib/format'

export function BearingSleeveDataPage() {
  return (
    <div>
      <PageHeader
        title="Bearing & Sleeve Data"
        description="Component catalogs behind the Technical Data Sheet's Bearing / Sleeve / Housing selectors — mirrors the client's Bearing & Sleeve Data, BRG_DATA, SL_DATA and HSG_DATA tabs."
      />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-[var(--color-blue-100)] bg-[var(--color-blue-50)] px-4 py-3 text-sm text-[var(--color-blue)]">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Read-only reference. Picking a designation on the Technical Data Sheet auto-fills its price straight from these tables.</p>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader title="A. Spherical Roller Bearings" description={`${BRG_CATALOG.length} designations — India prices (SKF/FAG)`} />
          <FilterableTable
            placeholder="Search bearing designation..."
            rows={BRG_CATALOG}
            filterKey={(r) => r.designation}
            headers={['Designation', 'Bore (mm)', 'INR/piece', 'EUR/piece', 'Delivery (days)']}
            renderRow={(r) => [r.designation, String(r.boreMm), formatCurrency(r.priceInr), `€${r.priceEur.toFixed(2)}`, String(r.deliveryDays)]}
            keyFn={(r) => r.designation}
          />
        </Card>

        <Card>
          <CardHeader title="B. Adapter Sleeves" description={`${SLEEVE_CATALOG.length} codes — matched by bearing designation`} />
          <FilterableTable
            placeholder="Search sleeve code or bearing..."
            rows={SLEEVE_CATALOG}
            filterKey={(r) => `${r.sleeveCode} ${r.forBearing}`}
            headers={['Sleeve Code', 'For Bearing', 'INR/piece', 'EUR/piece']}
            renderRow={(r) => [r.sleeveCode, r.forBearing, formatCurrency(r.priceInr), `€${r.priceEur.toFixed(2)}`]}
            keyFn={(r) => r.sleeveCode + r.forBearing}
          />
        </Card>

        <Card>
          <CardHeader title="C. Bearing Housings" description={`${HOUSING_CATALOG.length} designations — matched by bearing designation`} />
          <FilterableTable
            placeholder="Search housing or bearing..."
            rows={HOUSING_CATALOG}
            filterKey={(r) => `${r.housingDesignation} ${r.forBearing}`}
            headers={['Housing Designation', 'For Bearing', 'INR/piece', 'Delivery (days)']}
            renderRow={(r) => [r.housingDesignation, r.forBearing, formatCurrency(r.priceInr), String(r.deliveryDays)]}
            keyFn={(r) => r.housingDesignation + r.forBearing}
          />
        </Card>
      </div>
    </div>
  )
}

function FilterableTable<T>({
  rows,
  filterKey,
  headers,
  renderRow,
  keyFn,
  placeholder,
}: {
  rows: T[]
  filterKey: (row: T) => string
  headers: string[]
  renderRow: (row: T) => string[]
  keyFn: (row: T) => string
  placeholder: string
}) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => filterKey(r).toLowerCase().includes(q))
  }, [rows, filterKey, search])

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-3">
        <Search size={14} className="text-[var(--color-ink-faint)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full max-w-xs bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        <span className="ml-auto text-xs text-[var(--color-ink-faint)]">{filtered.length} of {rows.length}</span>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs uppercase text-[var(--color-ink-faint)]">
              {headers.map((h) => (
                <th key={h} className="px-4 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const cells = renderRow(row)
              return (
                <tr key={keyFn(row)} className="border-b border-[var(--color-border)] last:border-0">
                  {cells.map((cell, j) => (
                    <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-medium' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
