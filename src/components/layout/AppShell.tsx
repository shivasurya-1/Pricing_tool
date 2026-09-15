import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { ToastHost } from '@/components/ToastHost'

export function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-surface)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto min-h-full max-w-[1600px] p-5">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
