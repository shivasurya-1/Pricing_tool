import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  kind: 'success' | 'warning' | 'error' | 'info'
}

interface UiState {
  toasts: Toast[]
  pushToast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (message, kind = 'success') => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
