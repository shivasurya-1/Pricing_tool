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

export interface TechDataFieldDto {
  id: number
  key: string
  label: string
  section: string
  unit: string
  field_type: 'text' | 'number' | 'select'
  options: string[]
  is_auto: boolean
  is_catalog_derived: boolean
  is_read_only: boolean
  formula_key: string | null
  expression: string | null
  input_variables: string[]
  output_unit: string
  order: number
  is_core: boolean
  created_at: string
  updated_at: string
}

export interface NewCostRateInput {
  key: string
  label: string
  category: string
  value: number
  unit?: string
  order?: number
}

export interface NewTechDataFieldInput {
  key: string
  label: string
  section: string
  unit?: string
  field_type: 'text' | 'number' | 'select'
  options?: string[]
  order?: number
  is_auto: boolean
  expression?: string
  input_variables?: string[]
  output_unit?: string
}

export interface FormulaPreviewResult {
  current: { result: number | null; error: string | null }
  candidate: { result: number | null; error: string | null }
}

export interface SectionDto {
  id: number
  key: string
  label: string
  order: number
}

export interface NewFormulaInput {
  key: string
  label: string
  section: string
  expression: string
  input_variables: string[]
  output_unit?: string
  order?: number
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
  techDataFields: Record<string, TechDataFieldDto>
  sections: SectionDto[]

  loadAll: () => Promise<void>
  updateFormula: (key: string, expression: string) => Promise<void>
  createFormula: (input: NewFormulaInput) => Promise<void>
  deleteFormula: (key: string) => Promise<void>
  deleteAllFormulas: () => Promise<void>
  previewFormula: (key: string, expression: string, variables: Record<string, number>) => Promise<FormulaPreviewResult>

  createSection: (input: { key: string; label: string; order?: number }) => Promise<void>
  renameSection: (id: number, label: string) => Promise<void>
  deleteSection: (id: number) => Promise<void>

  createTechDataField: (input: NewTechDataFieldInput) => Promise<TechDataFieldDto>
  updateTechDataField: (key: string, patch: Partial<Pick<TechDataFieldDto, 'label' | 'section' | 'unit' | 'options' | 'order'>>) => Promise<void>
  deleteTechDataField: (key: string) => Promise<void>

  createCostRate: (input: NewCostRateInput) => Promise<void>
  updateCostRate: (id: number, patch: Partial<Pick<CostRateValueDto, 'value'>>) => Promise<void>
  deleteCostRate: (id: number) => Promise<void>
}

function reindexCostRates(costRatesFull: CostRateValueDto[]) {
  return {
    costRatesFull,
    costRates: Object.fromEntries(costRatesFull.map((r) => [r.key, r.value])),
  }
}

export const useFormulaStore = create<FormulaState>((set, get) => ({
  loaded: false,
  loading: false,
  formulas: {},
  costRates: {},
  costRatesFull: [],
  techDataFields: {},
  sections: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [formulaList, rateList, fieldList, sections] = await Promise.all([
        api.get<FormulaDefinitionDto[]>('/formulas/'),
        api.get<CostRateValueDto[]>('/reference/cost-rates/'),
        api.get<TechDataFieldDto[]>('/formulas/tech-data-fields/'),
        api.get<SectionDto[]>('/formulas/sections/'),
      ])
      set({
        formulas: Object.fromEntries(formulaList.map((f) => [f.key, f])),
        costRates: Object.fromEntries(rateList.map((r) => [r.key, r.value])),
        costRatesFull: rateList,
        techDataFields: Object.fromEntries(fieldList.map((f) => [f.key, f])),
        sections,
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

  createFormula: async (input) => {
    const created = await api.post<FormulaDefinitionDto>('/formulas/', input)
    set((s) => ({ formulas: { ...s.formulas, [created.key]: created } }))
  },

  deleteFormula: async (key) => {
    await api.delete(`/formulas/${key}/`)
    set((s) => {
      const next = { ...s.formulas }
      delete next[key]
      return { formulas: next }
    })
  },

  deleteAllFormulas: async () => {
    await api.post('/formulas/delete-all/', {})
    await get().loadAll()
  },

  createSection: async (input) => {
    const created = await api.post<SectionDto>('/formulas/sections/', input)
    set((s) => ({ sections: [...s.sections, created] }))
  },

  renameSection: async (id, label) => {
    await api.patch<SectionDto>(`/formulas/sections/${id}/`, { label })
    // The rename cascades server-side to every formula/field that used the old
    // label — refetch rather than patch every local record individually.
    await get().loadAll()
  },

  deleteSection: async (id) => {
    await api.delete(`/formulas/sections/${id}/`)
    set((s) => ({ sections: s.sections.filter((sec) => sec.id !== id) }))
  },

  createTechDataField: async (input) => {
    const created = await api.post<TechDataFieldDto>('/formulas/tech-data-fields/', input)
    set((s) => ({ techDataFields: { ...s.techDataFields, [created.key]: created } }))
    return created
  },

  updateTechDataField: async (key, patch) => {
    const updated = await api.patch<TechDataFieldDto>(`/formulas/tech-data-fields/${key}/`, patch)
    set((s) => ({ techDataFields: { ...s.techDataFields, [key]: updated } }))
  },

  deleteTechDataField: async (key) => {
    await api.delete(`/formulas/tech-data-fields/${key}/`)
    set((s) => {
      const next = { ...s.techDataFields }
      delete next[key]
      return { techDataFields: next }
    })
  },

  createCostRate: async (input) => {
    const created = await api.post<CostRateValueDto>('/reference/cost-rates/', input)
    set((s) => reindexCostRates([...s.costRatesFull, created]))
  },

  updateCostRate: async (id, patch) => {
    const updated = await api.patch<CostRateValueDto>(`/reference/cost-rates/${id}/`, patch)
    set((s) => reindexCostRates(s.costRatesFull.map((r) => (r.id === id ? updated : r))))
  },

  deleteCostRate: async (id) => {
    await api.delete(`/reference/cost-rates/${id}/`)
    set((s) => reindexCostRates(s.costRatesFull.filter((r) => r.id !== id)))
  },
}))
