import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, Boxes } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { deriveTasksForRole } from '@/lib/tasks'
import { NAV_SECTIONS, isNavItemVisible } from '@/components/layout/navConfig'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const role = useAuthStore((s) => s.role)
  const rfqs = useDataStore((s) => s.rfqs)
  const notifications = useDataStore((s) => s.notifications)

  const taskCount = deriveTasksForRole(rfqs, role).length
  const unreadCount = notifications.filter((n) => !n.read && (!n.targetRole || n.targetRole === role)).length

  return (
    <aside
      className={clsx(
        'flex h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-navy)] text-white transition-all',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
        <Boxes size={20} className="shrink-0 text-[var(--color-blue)]" />
        {!collapsed && <span className="truncate text-sm font-semibold">Apex ERP · RFQ Suite</span>}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => isNavItemVisible(item, role))
          if (visibleItems.length === 0) return null
          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{section.title}</p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const path = item.to.split('?')[0]
                  const active = location.pathname === path
                  const badge = item.to.startsWith('/tasks') ? taskCount : item.to.startsWith('/notifications') ? unreadCount : 0
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.label + item.to}
                      to={item.to}
                      data-tour={item.dataTour}
                      className={clsx(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                        active ? 'bg-white/10 text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white',
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={16} className="shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && badge > 0 && (
                        <span className="rounded-full bg-[var(--color-blue)] px-1.5 py-0.5 text-[10px] font-semibold">{badge}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center gap-2 border-t border-white/10 py-3 text-xs text-white/60 hover:bg-white/5 hover:text-white"
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  )
}
