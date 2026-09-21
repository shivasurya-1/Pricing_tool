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
}

interface AuthState {
  isAuthenticated: boolean
  /** A real session token from POST /auth/login/. Null for the dev-only demo-role
   * path (loginAs/switchRole) — apiClient.ts falls back to X-Demo-Role only when
   * this is null AND running in dev. */
  token: string | null
  role: Role
  name: string
  email: string
  color: string
  toursSeen: Partial<Record<Role, boolean>>

  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void

  /** Dev-only instant demo login — never reachable from the production build's
   * LoginPage (see its import.meta.env.DEV gate), and the backend only accepts the
   * matching X-Demo-Role header when DEBUG=True either way. */
  loginAs: (role: Role) => void
  switchRole: (role: Role) => void

  markTourSeen: (role: Role) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      role: 'Sales',
      name: '',
      email: '',
      color: '#2563eb',
      toursSeen: {},

      login: async (username, password) => {
        try {
          const res = await api.post<{ token: string; user: MeResponse }>('/auth/login/', { username, password })
          const u = res.user
          set({
            isAuthenticated: true,
            token: res.token,
            role: u.role,
            name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
            email: u.email,
            color: DEMO_PERSONA[u.role]?.color ?? '#2563eb',
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
        set({ isAuthenticated: false, token: null })
      },

      loginAs: (role) =>
        set({
          isAuthenticated: true,
          token: null,
          role,
          name: DEMO_PERSONA[role].name,
          email: DEMO_PERSONA[role].email,
          color: DEMO_PERSONA[role].color,
        }),

      switchRole: (role) =>
        set({
          role,
          name: DEMO_PERSONA[role].name,
          email: DEMO_PERSONA[role].email,
          color: DEMO_PERSONA[role].color,
        }),

      markTourSeen: (role) => set((s) => ({ toursSeen: { ...s.toursSeen, [role]: true } })),
    }),
    { name: 'rfq-prototype-auth' },
  ),
)
