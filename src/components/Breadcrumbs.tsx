import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="mb-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} />}
          {item.to ? (
            <Link to={item.to} className="hover:text-[var(--color-blue)]">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-[var(--color-ink-soft)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
