import type { ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'

/**
 * Gates a page's content on its backing store having actually loaded — without this,
 * a page reading straight from a store defaults (empty arrays) renders "0 rows" /
 * "No rows yet" identically whether the backend genuinely has no data or just hasn't
 * responded yet (or is unreachable), which reads as data loss to an admin. Mirrors
 * the inline pattern FormulasPage.tsx already used for formulaStore.
 */
export function RequireLoaded({ loaded, loading, children }: { loaded: boolean; loading: boolean; children: ReactNode }) {
  if (loading) return <EmptyState title="Loading..." />
  if (!loaded) {
    return (
      <EmptyState
        title="Backend not reachable"
        description="This page needs the Django backend running. Values shown elsewhere in the app fall back to built-in defaults in the meantime, but this page has nothing to show until the backend responds."
      />
    )
  }
  return <>{children}</>
}
