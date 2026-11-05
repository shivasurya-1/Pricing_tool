import { create } from 'zustand'
import { api, ApiError } from '@/lib/apiClient'
import type { Role } from '@/types'

/** Per-role permission grid for the Users & Roles page: {module: [actions]}.
 * Stored on the server (accounts app) — GET /auth/roles/ and PATCH /auth/roles/<role>/, both Admin-only. */

export const PERMISSION_MODULES = ['Create RFQ', 'Operations Review', 'Sourcing', 'Costing', 'Approval', 'Masters'] as const
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'] as const
export type PermissionGrid = Record<string, string[]>

interface RolesResponse {
  modules: string[]
  actions: string[]
  roles: Record<string, PermissionGrid>
}

/** A role's grid with every known module present, so the UI never sees a missing key. */
const normalize = (grid: PermissionGrid | undefined): PermissionGrid =>
  Object.fromEntries(PERMISSION_MODULES.map((m) => [m, PERMISSION_ACTIONS.filter((a) => grid?.[m]?.includes(a))]))

/** True when two grids grant exactly the same actions (ignores the order they were ticked in). */
export const sameGrid = (a: PermissionGrid, b: PermissionGrid) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))

/** The API reports validation problems as {detail} or {permissions: [...]} — show the readable part. */
function readableError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error('Failed to save permissions.')
  try {
    const body = JSON.parse(err.message)
    const msg = body.detail ?? body.permissions
    if (msg) return new ApiError(err.status, Array.isArray(msg) ? msg.join(' ') : typeof msg === 'string' ? msg : JSON.stringify(msg))
  } catch {
    /* plain-text message — use as is */
  }
  return err
}

interface State {
  /** Grids from the server; empty until the first load. */
  grids: Partial<Record<Role, PermissionGrid>>
  loaded: boolean
  gridFor: (role: Role) => PermissionGrid
  load: () => Promise<void>
  saveRole: (role: Role, grid: PermissionGrid) => Promise<void>
}

export const useRolePermissionsStore = create<State>((set, get) => ({
  grids: {},
  loaded: false,

  gridFor: (role) => normalize(get().grids[role]),

  load: async () => {
    try {
      const res = await api.get<RolesResponse>('/auth/roles/')
      set({ grids: Object.fromEntries(Object.entries(res.roles).map(([r, g]) => [r, normalize(g)])), loaded: true })
    } catch {
      set({ loaded: false })
    }
  },

  saveRole: async (role, grid) => {
    try {
      // PATCH replaces the whole grid; a module left out means no access, so send every module.
      const res = await api.patch<{ role: string; permissions: PermissionGrid }>(`/auth/roles/${encodeURIComponent(role)}/`, { permissions: normalize(grid) })
      set((s) => ({ grids: { ...s.grids, [role]: normalize(res.permissions) } }))
    } catch (err) {
      throw readableError(err)
    }
  },
}))
