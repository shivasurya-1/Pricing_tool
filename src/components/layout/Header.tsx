import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, HelpCircle, ChevronDown, LogOut, Repeat, Compass } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useDataStore } from '@/store/dataStore'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { Drawer } from '@/components/ui/Drawer'
import { NotificationList } from '@/components/NotificationList'
import { ROLES } from '@/types'
import { initials } from '@/lib/format'
import { startTour } from '@/lib/tour'

export function Header() {
  const navigate = useNavigate()
  const { role, name, color, switchRole, logout } = useAuthStore()
  const notifications = useDataStore((s) => s.notifications)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)

  const relevant = notifications.filter((n) => !n.targetRole || n.targetRole === role)
  const unreadCount = relevant.filter((n) => !n.read).length

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4">
      <GlobalSearch />

      <div className="hidden items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-ink-soft)] md:flex">
        <span className="font-medium">Apex Industrial Group</span>
        <ChevronDown size={13} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => startTour(role)}
          data-tour="start-tour-header"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-blue)] hover:bg-[var(--color-blue-50)]"
        >
          <Compass size={15} />
          Start Tour
        </button>

        <button className="rounded-md p-2 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]" title="Help">
          <HelpCircle size={17} />
        </button>

        <button
          onClick={() => setNotifOpen(true)}
          className="relative rounded-md p-2 text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
          title="Notifications"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-red)] text-[9px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-[var(--color-surface)]"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {initials(name)}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-xs font-medium text-[var(--color-ink)]">{name}</span>
              <span className="block text-[10px] text-[var(--color-ink-faint)]">{role}</span>
            </span>
            <ChevronDown size={14} className="text-[var(--color-ink-faint)]" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-md border border-[var(--color-border)] bg-white py-1.5 shadow-lg">
              <div className="border-b border-[var(--color-border)] px-3 pb-2">
                <p className="text-sm font-medium text-[var(--color-ink)]">{name}</p>
                <p className="text-xs text-[var(--color-ink-faint)]">{role}</p>
              </div>
              <button
                onClick={() => setRoleMenuOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)]"
              >
                <span className="flex items-center gap-2">
                  <Repeat size={14} /> Switch role
                </span>
                <ChevronDown size={13} className={roleMenuOpen ? 'rotate-180' : ''} />
              </button>
              {roleMenuOpen && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-1">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        switchRole(r)
                        setRoleMenuOpen(false)
                        setProfileOpen(false)
                        navigate('/dashboard')
                      }}
                      className="flex w-full items-center justify-between px-4 py-1.5 text-sm text-[var(--color-ink-soft)] hover:bg-white"
                    >
                      {r} {r === role && <span className="text-[var(--color-blue)]">●</span>}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="flex w-full items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-red)] hover:bg-[var(--color-red-50)]"
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <Drawer open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications" width="max-w-md">
        <NotificationList notifications={relevant} onNavigate={() => setNotifOpen(false)} />
      </Drawer>
    </header>
  )
}
