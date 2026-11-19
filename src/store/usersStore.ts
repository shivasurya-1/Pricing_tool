import { create } from 'zustand'
import { api } from '@/lib/apiClient'
import type { Role } from '@/types'
import { useRolePermissionsStore } from '@/store/rolePermissionsStore'

/** Real user administration for the Users & Roles page (Admin-only backend
 * endpoint — see accounts/views.py::UserViewSet). Same loaded/loading/silent-catch
 * contract as every other store here; only fetched on demand (Users & Roles is
 * the only consumer) rather than on every app load. */

export interface UserAdminDto {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  role: Role
  is_active: boolean
  last_login: string | null
  date_joined: string
}

/** No password: the new user chooses their own from the link in their welcome email. */
export interface NewUserInput {
  username: string
  first_name?: string
  last_name?: string
  email?: string
  role: Role
}

export interface CreateUserResult {
  /** Whether the welcome email with the set-password link went out. */
  emailSent: boolean
  /** Only when the email failed: the one-time link, for the Admin to pass on another way. */
  setPasswordUrl?: string
  /** How long the link works. */
  linkValidHours: number
}

interface UsersState {
  loaded: boolean
  loading: boolean
  users: UserAdminDto[]

  loadAll: () => Promise<void>
  /** Resolves with whether the backend managed to email the new user their set-password link. */
  createUser: (input: NewUserInput) => Promise<CreateUserResult>
  deleteUser: (id: number) => Promise<void>
  updateUser: (id: number, patch: Partial<Pick<UserAdminDto, 'role' | 'is_active' | 'first_name' | 'last_name' | 'email'>>) => Promise<void>
}

export const useUsersStore = create<UsersState>((set, get) => ({
  loaded: false,
  loading: false,
  users: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      // The role grids load alongside the users; a failure there doesn't block the page.
      const [users] = await Promise.all([api.get<UserAdminDto[]>('/auth/users/'), useRolePermissionsStore.getState().load()])
      set({ users, loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createUser: async (input) => {
    // POST /auth/users/ returns the user plus email_sent / link_valid_hours (and set_password_url
    // only when the email failed); those flags aren't part of the user record.
    const { email_sent, set_password_url, link_valid_hours, ...created } = await api.post<
      Partial<UserAdminDto> & Pick<UserAdminDto, 'id' | 'username' | 'role'> & { email_sent?: boolean; set_password_url?: string; link_valid_hours?: number }
    >('/auth/users/', input)
    const user: UserAdminDto = { first_name: '', last_name: '', email: '', is_active: true, last_login: null, date_joined: new Date().toISOString(), ...created }
    set((s) => ({ users: [...s.users, user] }))
    return { emailSent: email_sent === true, setPasswordUrl: set_password_url || undefined, linkValidHours: link_valid_hours ?? 72 }
  },

  deleteUser: async (id) => {
    await api.delete<void>(`/auth/users/${id}/`)
    set((s) => ({ users: s.users.filter((u) => u.id !== id) }))
  },

  updateUser: async (id, patch) => {
    const updated = await api.patch<UserAdminDto>(`/auth/users/${id}/`, patch)
    set((s) => ({ users: s.users.map((u) => (u.id === id ? updated : u)) }))
  },
}))
