import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types'
import { DEMO_PERSONA } from '@/data/mockSeed'
import { api, ApiError } from '@/lib/apiClient'

interface MeResponse {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: Role
  permissions?: unknown
}

const fullName = (u: MeResponse) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username
const colorFor = (role: Role) => DEMO_PERSONA[role]?.color ?? '#2563eb'

interface AuthState {
  isAuthenticated: boolean
  /** The session token from POST /auth/login/. Every API call needs it; there is no
   * password-free sign-in. */
  token: string | null
  /** The signed-in account's own role, as the backend reports it. Only an 'Admin' account may
   * view as another role. */
  accountRole: Role | null
  /** The role whose pages are shown. Equals accountRole unless an Admin is "viewing as". */
  role: Role
  name: string
  email: string
  color: string
  toursSeen: Partial<Record<Role, boolean>>

  /** `role` is the card picked on the login page; the backend refuses (403) if the account's role differs. */
  login: (username: string, password: string, role?: Role) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
  /** On app start: check the stored token with GET /auth/me/ and re-apply the account's real role. */
  restoreSession: () => Promise<void>
  /** Swap in a fresh session token (after a password change the old one is retired). */
  setToken: (token: string) => void
  /** "View as" — Admin accounts only; changes what is shown, never the token or the account. */
  switchRole: (role: Role) => void

  markTourSeen: (role: Role) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      accountRole: null,
      role: 'Sales',
      name: '',
      email: '',
      color: '#2563eb',
      toursSeen: {},

      login: async (username, password, role) => {
        try {
          const res = await api.post<{ token: string; user: MeResponse }>('/auth/login/', { username, password, ...(role && { role }) })
          const u = res.user
          set({
            isAuthenticated: true,
            token: res.token,
            accountRole: u.role,
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
        // Fire the invalidation request WHILE the token is still in the store —
        // apiClient reads it synchronously when building this call, so clearing
        // state first would send the request with no Authorization header at all
        // and the token would never actually get deleted server-side. Best-effort:
        // the user is logged out locally either way; nothing downstream waits on this.
        if (get().token) api.post('/auth/logout/', {}).catch(() => {})
        set({ isAuthenticated: false, token: null, accountRole: null })
      },

      restoreSession: async () => {
        const { token, isAuthenticated } = get()
        if (!token) {
          if (isAuthenticated) set({ isAuthenticated: false, accountRole: null })
          return
        }
        try {
          const u = await api.get<MeResponse>('/auth/me/')
          // A non-Admin account can only ever see its own role, whatever was stored locally.
          const viewing = u.role === 'Admin' ? get().role : u.role
          set({
            isAuthenticated: true,
            accountRole: u.role,
            role: viewing,
            email: u.email,
            ...(viewing === u.role && { name: fullName(u), color: colorFor(u.role) }),
          })
        } catch (err) {
          // 401 is handled by apiClient already; 403 means the same here. If the server is
          // unreachable, keep the session — the next call will sort it out.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) get().logout()
        }
      },

      setToken: (token) => set({ token }),

      switchRole: (role) => {
        if (get().accountRole !== 'Admin') return
        set({ role, name: DEMO_PERSONA[role].name, color: DEMO_PERSONA[role].color })
      },

      markTourSeen: (role) => set((s) => ({ toursSeen: { ...s.toursSeen, [role]: true } })),
    }),
    {
      name: 'rfq-prototype-auth',
      version: 2,
      // Sessions saved before real sign-in was required (no token, role picked by a card) are signed out.
      migrate: (persisted) => ({ ...(persisted as object), isAuthenticated: false, token: null, accountRole: null }),
    },
  ),
)
