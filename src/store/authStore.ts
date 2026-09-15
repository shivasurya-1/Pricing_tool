import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/types'
import { DEMO_PERSONA } from '@/data/mockSeed'

interface AuthState {
  isAuthenticated: boolean
  role: Role
  name: string
  email: string
  color: string
  toursSeen: Partial<Record<Role, boolean>>

  loginAs: (role: Role) => void
  switchRole: (role: Role) => void
  logout: () => void
  markTourSeen: (role: Role) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      role: 'Sales',
      name: DEMO_PERSONA.Sales.name,
      email: DEMO_PERSONA.Sales.email,
      color: DEMO_PERSONA.Sales.color,
      toursSeen: {},

      loginAs: (role) =>
        set({
          isAuthenticated: true,
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

      logout: () => set({ isAuthenticated: false }),

      markTourSeen: (role) => set((s) => ({ toursSeen: { ...s.toursSeen, [role]: true } })),
    }),
    { name: 'rfq-prototype-auth' },
  ),
)
