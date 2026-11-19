import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types'
import { DEMO_PERSONA } from '@/data/mockSeed'
import { api, ApiError, refreshSession } from '@/lib/apiClient'

/** A role's Users & Roles grid: module -> actions ('view' | 'create' | 'edit' | 'delete'). */
export type PermissionGrid = Partial<Record<string, string[]>>

interface MeResponse {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: Role
  permissions?: PermissionGrid
}

const fullName = (u: MeResponse) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
const colorFor = (role: Role) => DEMO_PERSONA[role]?.color ?? '#2563eb'

interface AuthState {
  isAuthenticated: boolean
  /** The access token (15 minutes). Kept in memory only — never in localStorage — and sent
   * with every API call. The refresh token is an httpOnly cookie this code cannot read;
   * apiClient.refreshSession() uses it to get a new access token. */
  token: string | null
  /** False until restoreSession() has finished on page load (the access token isn't stored,
   * so a reload has to get a new one first). */
  sessionChecked: boolean
  /** The signed-in account's own role, as the backend reports it. Only an 'Admin' account may
   * view as another role. */
  accountRole: Role | null
  /** The account's permission grid, from the server (login and /auth/me/). */
  permissions: PermissionGrid
  /** The role whose pages are shown. Equals accountRole unless an Admin is "viewing as". */
  role: Role
  name: string
  email: string
  color: string
  toursSeen: Partial<Record<Role, boolean>>

  /** `role` is the card picked on the login page; the backend refuses (403) if the account's role differs. */
  login: (username: string, password: string, role?: Role) => Promise<{ ok: true } | { ok: false; error: string }>
  /** Signs this browser out on the server (retires its refresh cookie) and locally. */
  logout: () => void
  /** Local sign-out only, for a session the server has already ended (refresh refused). */
  clearSession: () => void
  /** On app start: get an access token from the refresh cookie, then check the account with
   * GET /auth/me/ and re-apply its real role and permissions. */
  restoreSession: () => Promise<void>
  /** Swap in a fresh access token (after a refresh or a password change). */
  setAccess: (access: string) => void
  /** "View as" — Admin accounts only; changes what is shown, never the token or the account. */
  switchRole: (role: Role) => void

  markTourSeen: (role: Role) => void
}

const SIGNED_OUT = { isAuthenticated: false, token: null, accountRole: null, permissions: {} } as const

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      sessionChecked: false,
      accountRole: null,
      permissions: {},
      role: 'Sales',
      name: '',
      email: '',
      color: '#2563eb',
      toursSeen: {},

      login: async (username, password, role) => {
        try {
          // The refresh token comes back as an httpOnly cookie; only the access token is in the body.
          const res = await api.post<{ access: string; user: MeResponse }>('/auth/login/', { username, password, ...(role && { role }) })
          const u = res.user
          set({
            isAuthenticated: true,
            token: res.access,
            sessionChecked: true,
            accountRole: u.role,
            permissions: u.permissions ?? {},
            role: u.role,
            name: fullName(u),
            email: u.email,
            color: colorFor(u.role),
          })
          return { ok: true }
        } catch (err) {
          return { ok: false, error: err instanceof ApiError ? err.message : 'Could not reach the server.' }
        }
      },

      logout: () => {
        // Retire this browser's refresh cookie on the server (other browsers signed in to the
        // same account stay signed in). Best-effort: the user is logged out locally either way.
        api.post('/auth/logout/', {}).catch(() => {})
        set(SIGNED_OUT)
      },

      clearSession: () => set(SIGNED_OUT),

      restoreSession: async () => {
        try {
          if (!get().isAuthenticated) return
          // A reload starts with no access token: get one from the refresh cookie first.
          if (!get().token && !(await refreshSession())) {
            set(SIGNED_OUT)
            return
          }
          const u = await api.get<MeResponse>('/auth/me/')
          // A non-Admin account can only ever see its own role, whatever was stored locally.
          const viewing = u.role === 'Admin' ? get().role : u.role
          set({
            isAuthenticated: true,
            accountRole: u.role,
            permissions: u.permissions ?? {},
            role: viewing,
            email: u.email,
            ...(viewing === u.role && { name: fullName(u), color: colorFor(u.role) }),
          })
        } catch (err) {
          // 401 is handled by apiClient already; 403 means the same here. If the server is
          // unreachable, keep the session — the next call will sort it out.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) get().clearSession()
        } finally {
          set({ sessionChecked: true })
        }
      },

      setAccess: (access) => set({ token: access }),

      switchRole: (role) => {
        if (get().accountRole !== 'Admin') return
        set({ role, name: DEMO_PERSONA[role].name, color: DEMO_PERSONA[role].color })
      },

      markTourSeen: (role) => set((s) => ({ toursSeen: { ...s.toursSeen, [role]: true } })),
    }),
    {
      name: 'rfq-prototype-auth',
      version: 4,
      // Never stored: the access token (memory only) and the page-load check flag.
      partialize: ({ token: _token, sessionChecked: _checked, ...rest }) => rest,
      // Older saved sessions are signed out and their stored tokens dropped: v1 had no token,
      // v2 a never-expiring one, v3 kept the access and refresh tokens in localStorage.
      migrate: (persisted) => {
        const { token: _t, refreshToken: _r, ...rest } = (persisted ?? {}) as Record<string, unknown>
        return { ...rest, ...SIGNED_OUT } as unknown as AuthState
      },
    },
  ),
)

/** Whether the signed-in account holds `action` on `module` (Admin always does). */
export function canDo(state: Pick<AuthState, 'accountRole' | 'permissions'>, module: string, action: string): boolean {
  if (state.accountRole === 'Admin') return true
  return (state.permissions[module] ?? []).includes(action)
}
