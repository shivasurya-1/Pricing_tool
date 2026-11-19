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

/** No password: the backend makes a random temporary one and emails it to the new user. */
export interface NewUserInput {
  username: string
  first_name?: string
  last_name?: string
  email?: string
  role: Role
}

export interface CreateUserResult {
  /** Whether the welcome email (username, temporary password, Reset password button) went out. */
  emailSent: boolean
  /** Only when the email failed: the temporary password and the Reset password page link,
   * for the Admin to pass on another way. */
  temporaryPassword?: string
  resetUrl?: string
}

interface UsersState {
  loaded: boolean
  loading: boolean
  users: UserAdminDto[]

  loadAll: () => Promise<void>
  /** Resolves with whether the backend managed to email the new user their login details. */
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
    // POST /auth/users/ returns the user plus email_sent (and temporary_password / reset_url
    // only when the email failed); those aren't part of the user record.
    const { email_sent, temporary_password, reset_url, ...created } = await api.post<
      Partial<UserAdminDto> & Pick<UserAdminDto, 'id' | 'username' | 'role'> & { email_sent?: boolean; temporary_password?: string; reset_url?: string }
    >('/auth/users/', input)
    const user: UserAdminDto = { first_name: '', last_name: '', email: '', is_active: true, last_login: null, date_joined: new Date().toISOString(), ...created }
    set((s) => ({ users: [...s.users, user] }))
    return { emailSent: email_sent === true, temporaryPassword: temporary_password || undefined, resetUrl: reset_url || undefined }
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
