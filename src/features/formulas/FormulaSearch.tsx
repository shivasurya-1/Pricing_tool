import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search, X } from 'lucide-react'
import clsx from 'clsx'

export type SearchKind = 'section' | 'field' | 'formula'

/** One thing the Formulas page can jump to. The page builds these from its own data. */
export interface SearchItem {
  kind: SearchKind
  /** Unique within the list. */
  id: string
  title: string
  /** Shown under the title, e.g. the key. */
  detail: string
  section: string
  sheet: 'tech_sheet' | 'pricing_tool'
  /** The field or formula key, for a row-level result. Absent for a section. */
  rowKey?: string
  /** Lower-case text the query is matched against. */
  haystack: string
}

const GROUPS: { kind: SearchKind; label: string; limit: number }[] = [
  { kind: 'section', label: 'Sections', limit: 6 },
  { kind: 'field', label: 'Fields', limit: 12 },
  { kind: 'formula', label: 'Formulas', limit: 8 },
]
const SHEET_LABEL = { tech_sheet: 'Technical Sheet', pricing_tool: 'Pricing Tool' } as const

/**
 * "Jump to" search for the Formulas page: type part of a section, field or formula name (or its
 * key) and pick a result. The page then opens the right tab and scrolls straight to it, so
 * nobody has to scroll past every section to get there.
 */
export function FormulaSearch({ items, onPick }: { items: SearchItem[]; onPick: (item: SearchItem) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    const q = query.trim().toLowerCase()
    const matched = items.filter((it) => terms.every((t) => it.haystack.includes(t)))
    // Titles that start with the query come first, then titles containing it, then key/section matches.
    const rank = (it: SearchItem) => (it.title.toLowerCase().startsWith(q) ? 0 : it.title.toLowerCase().includes(q) ? 1 : 2)
    return GROUPS.flatMap((g) =>
      matched
        .filter((it) => it.kind === g.kind)
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, g.limit),
    )
  }, [items, query])

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  const choose = (item: SearchItem) => {
    onPick(item)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      choose(results[active])
    }
  }

  const showPanel = open && query.trim() !== ''
  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
        <input
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="formula-search-results"
          aria-label="Search sections, fields and formulas"
          placeholder="Jump to a section, field or formula…  e.g. “shaft”, “lagging”, “shellOD”"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm outline-none focus:border-[var(--color-blue)]"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
            <X size={15} />
          </button>
        )}
      </div>

      {showPanel && (
        <div id="formula-search-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white p-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--color-ink-faint)]">Nothing matches “{query.trim()}”. Try part of a name or a key.</p>
          ) : (
            GROUPS.map((g) => {
              const inGroup = results.filter((r) => r.kind === g.kind)
              if (!inGroup.length) return null
              return (
                <div key={g.kind} className="mb-1 last:mb-0">
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">{g.label}</p>
                  {inGroup.map((r) => {
                    const isActive = results[active]?.id === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(results.indexOf(r))}
                        onClick={() => choose(r)}
                        className={clsx('flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left', isActive ? 'bg-[var(--color-blue-50)]' : 'hover:bg-[var(--color-surface)]')}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[var(--color-ink)]">{r.title}</span>
                          <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                            {r.detail}
                            {r.kind !== 'section' && <> · {r.section}</>}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]">{SHEET_LABEL[r.sheet]}</span>
                          {isActive && <CornerDownLeft size={13} className="text-[var(--color-blue)]" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
