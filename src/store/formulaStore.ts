import { create } from 'zustand'
import { api, ApiError } from '@/lib/apiClient'

export interface FormulaDefinitionDto {
  id: number
  key: string
  label: string
  section: string
  expression: string
  input_variables: string[]
  output_unit: string
  order: number
  updated_by_name: string | null
  updated_at: string
}

export interface CostRateValueDto {
  id: number
  key: string
  label: string
  category: string
  value: number
  unit: string
  order: number
}

export interface FormulaPreviewResult {
  current: { result: number | null; error: string | null }
  candidate: { result: number | null; error: string | null }
}

interface FormulaState {
  /** Whether the backend was reachable and formulas loaded — callers fall back to
   * static hardcoded calculation when this is false, so the app works identically
   * to before this feature existed if no backend is running/deployed. */
  loaded: boolean
  loading: boolean
  formulas: Record<string, FormulaDefinitionDto>
  costRates: Record<string, number>
  costRatesFull: CostRateValueDto[]

  loadAll: () => Promise<void>
  updateFormula: (key: string, expression: string) => Promise<void>
  previewFormula: (key: string, expression: string, variables: Record<string, number>) => Promise<FormulaPreviewResult>
}

export const useFormulaStore = create<FormulaState>((set, get) => ({
  loaded: false,
  loading: false,
  formulas: {},
  costRates: {},
  costRatesFull: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [formulaList, rateList] = await Promise.all([
        api.get<FormulaDefinitionDto[]>('/formulas/'),
        api.get<CostRateValueDto[]>('/reference/cost-rates/'),
      ])
      set({
        formulas: Object.fromEntries(formulaList.map((f) => [f.key, f])),
        costRates: Object.fromEntries(rateList.map((r) => [r.key, r.value])),
        costRatesFull: rateList,
        loaded: true,
        loading: false,
      })
    } catch {
      // Backend not running/deployed — leave `loaded: false` so calc modules use
      // their static fallback. Not a user-facing error in this phase.
      set({ loading: false })
    }
  },

  updateFormula: async (key, expression) => {
    const updated = await api.patch<FormulaDefinitionDto>(`/formulas/${key}/`, { expression })
    set((s) => ({ formulas: { ...s.formulas, [key]: updated } }))
  },

  previewFormula: async (key, expression, variables) => {
    try {
      return await api.post<FormulaPreviewResult>(`/formulas/${key}/preview/`, { expression, variables })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Preview failed'
      return { current: { result: null, error: message }, candidate: { result: null, error: message } }
    }
  },
}))
