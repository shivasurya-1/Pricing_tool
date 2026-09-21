import { create } from 'zustand'
import { api } from '@/lib/apiClient'
import type { Role } from '@/types'

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

export interface NewUserInput {
  username: string
  first_name?: string
  last_name?: string
  email?: string
  role: Role
  password: string
}

interface UsersState {
  loaded: boolean
  loading: boolean
  users: UserAdminDto[]

  loadAll: () => Promise<void>
  createUser: (input: NewUserInput) => Promise<void>
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
      const users = await api.get<UserAdminDto[]>('/auth/users/')
      set({ users, loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createUser: async (input) => {
    const created = await api.post<UserAdminDto>('/auth/users/', input)
    set((s) => ({ users: [...s.users, created] }))
  },

  updateUser: async (id, patch) => {
    const updated = await api.patch<UserAdminDto>(`/auth/users/${id}/`, patch)
    set((s) => ({ users: s.users.map((u) => (u.id === id ? updated : u)) }))
  },
}))
