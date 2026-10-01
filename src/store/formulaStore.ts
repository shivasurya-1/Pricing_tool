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

// One resource per Cost Rate Tables section — the backend split what used to be a
// single /reference/cost-rates/ (with a `category` field) into 4 separate endpoints,
// each with field names specific to that section, plus Lagging moved here too (see
// LaggingCatalogDto in referenceStore.ts, still its own catalog shape/state).

export interface GlobalParameterDto {
  id: number
  key: string
  parameter: string
  value: number
  unit: string
  notes: string
  order: number
}

export interface MaterialRateDto {
  id: number
  key: string
  material: string
  inr_per_kg: number
  eur_per_kg: number | null
  notes: string
  order: number
}

export interface LabourRateDto {
  id: number
  key: string
  operation: string
  inr_per_hour: number
  eur_per_hour: number | null
  sourcing_default: string
  order: number
}

export interface LogisticsRateDto {
  id: number
  key: string
  item: string
  rate: number
  unit: string
  notes: string
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
  /** Reference catalog ("table::field") the options were imported from. */
  options_source: string
  /** Filled in automatically and shown read-only on every RFQ's sheet when set. */
  fixed_value: string
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

export interface NewGlobalParameterInput {
  key: string
  parameter: string
  value: number
  unit?: string
  notes?: string
  order?: number
}

export interface NewMaterialRateInput {
  key: string
  material: string
  inr_per_kg: number
  eur_per_kg?: number | null
  notes?: string
  order?: number
}

export interface NewLabourRateInput {
  key: string
  operation: string
  inr_per_hour: number
  eur_per_hour?: number | null
  sourcing_default?: string
  order?: number
}

export interface NewLogisticsRateInput {
  key: string
  item: string
  rate: number
  unit?: string
  notes?: string
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
  /** Flat key → number map every pricing formula reads from — built from the 4 lists
   * below (value / inr_per_kg / inr_per_hour / rate respectively), rebuilt after every
   * mutation to any of them. */
  costRates: Record<string, number>
  globalParameters: GlobalParameterDto[]
  materialRates: MaterialRateDto[]
  labourRates: LabourRateDto[]
  logisticsRates: LogisticsRateDto[]
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
  updateTechDataField: (key: string, patch: Partial<Pick<TechDataFieldDto, 'label' | 'section' | 'unit' | 'field_type' | 'options' | 'options_source' | 'fixed_value' | 'order'>>) => Promise<void>
  deleteTechDataField: (key: string) => Promise<void>

  createGlobalParameter: (input: NewGlobalParameterInput) => Promise<void>
  updateGlobalParameter: (id: number, patch: Partial<Pick<GlobalParameterDto, 'parameter' | 'value' | 'unit' | 'notes'>>) => Promise<void>
  deleteGlobalParameter: (id: number) => Promise<void>

  createMaterialRate: (input: NewMaterialRateInput) => Promise<void>
  updateMaterialRate: (id: number, patch: Partial<Pick<MaterialRateDto, 'material' | 'inr_per_kg' | 'eur_per_kg' | 'notes'>>) => Promise<void>
  deleteMaterialRate: (id: number) => Promise<void>

  createLabourRate: (input: NewLabourRateInput) => Promise<void>
  updateLabourRate: (id: number, patch: Partial<Pick<LabourRateDto, 'operation' | 'inr_per_hour' | 'eur_per_hour' | 'sourcing_default'>>) => Promise<void>
  deleteLabourRate: (id: number) => Promise<void>

  createLogisticsRate: (input: NewLogisticsRateInput) => Promise<void>
  updateLogisticsRate: (id: number, patch: Partial<Pick<LogisticsRateDto, 'item' | 'rate' | 'unit' | 'notes'>>) => Promise<void>
  deleteLogisticsRate: (id: number) => Promise<void>
}

function buildCostRates(
  globalParameters: GlobalParameterDto[],
  materialRates: MaterialRateDto[],
  labourRates: LabourRateDto[],
  logisticsRates: LogisticsRateDto[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of globalParameters) map[r.key] = r.value
  for (const r of materialRates) map[r.key] = r.inr_per_kg
  for (const r of labourRates) map[r.key] = r.inr_per_hour
  for (const r of logisticsRates) map[r.key] = r.rate
  return map
}

export const useFormulaStore = create<FormulaState>((set, get) => ({
  loaded: false,
  loading: false,
  formulas: {},
  costRates: {},
  globalParameters: [],
  materialRates: [],
  labourRates: [],
  logisticsRates: [],
  techDataFields: {},
  sections: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [formulaList, globalParameters, materialRates, labourRates, logisticsRates, fieldList, sections] = await Promise.all([
        api.get<FormulaDefinitionDto[]>('/formulas/'),
        api.get<GlobalParameterDto[]>('/reference/cost-rates/global-parameters/'),
        api.get<MaterialRateDto[]>('/reference/cost-rates/material-rates/'),
        api.get<LabourRateDto[]>('/reference/cost-rates/machining-labour-rates/'),
        api.get<LogisticsRateDto[]>('/reference/cost-rates/logistics-packing-rates/'),
        api.get<TechDataFieldDto[]>('/formulas/tech-data-fields/'),
        api.get<SectionDto[]>('/formulas/sections/'),
      ])
      set({
        formulas: Object.fromEntries(formulaList.map((f) => [f.key, f])),
        globalParameters,
        materialRates,
        labourRates,
        logisticsRates,
        costRates: buildCostRates(globalParameters, materialRates, labourRates, logisticsRates),
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

  createGlobalParameter: async (input) => {
    const created = await api.post<GlobalParameterDto>('/reference/cost-rates/global-parameters/', input)
    set((s) => {
      const globalParameters = [...s.globalParameters, created]
      return { globalParameters, costRates: buildCostRates(globalParameters, s.materialRates, s.labourRates, s.logisticsRates) }
    })
  },
  updateGlobalParameter: async (id, patch) => {
    const updated = await api.patch<GlobalParameterDto>(`/reference/cost-rates/global-parameters/${id}/`, patch)
    set((s) => {
      const globalParameters = s.globalParameters.map((r) => (r.id === id ? updated : r))
      return { globalParameters, costRates: buildCostRates(globalParameters, s.materialRates, s.labourRates, s.logisticsRates) }
    })
  },
  deleteGlobalParameter: async (id) => {
    await api.delete(`/reference/cost-rates/global-parameters/${id}/`)
    set((s) => {
      const globalParameters = s.globalParameters.filter((r) => r.id !== id)
      return { globalParameters, costRates: buildCostRates(globalParameters, s.materialRates, s.labourRates, s.logisticsRates) }
    })
  },

  createMaterialRate: async (input) => {
    const created = await api.post<MaterialRateDto>('/reference/cost-rates/material-rates/', input)
    set((s) => {
      const materialRates = [...s.materialRates, created]
      return { materialRates, costRates: buildCostRates(s.globalParameters, materialRates, s.labourRates, s.logisticsRates) }
    })
  },
  updateMaterialRate: async (id, patch) => {
    const updated = await api.patch<MaterialRateDto>(`/reference/cost-rates/material-rates/${id}/`, patch)
    set((s) => {
      const materialRates = s.materialRates.map((r) => (r.id === id ? updated : r))
      return { materialRates, costRates: buildCostRates(s.globalParameters, materialRates, s.labourRates, s.logisticsRates) }
    })
  },
  deleteMaterialRate: async (id) => {
    await api.delete(`/reference/cost-rates/material-rates/${id}/`)
    set((s) => {
      const materialRates = s.materialRates.filter((r) => r.id !== id)
      return { materialRates, costRates: buildCostRates(s.globalParameters, materialRates, s.labourRates, s.logisticsRates) }
    })
  },

  createLabourRate: async (input) => {
    const created = await api.post<LabourRateDto>('/reference/cost-rates/machining-labour-rates/', input)
    set((s) => {
      const labourRates = [...s.labourRates, created]
      return { labourRates, costRates: buildCostRates(s.globalParameters, s.materialRates, labourRates, s.logisticsRates) }
    })
  },
  updateLabourRate: async (id, patch) => {
    const updated = await api.patch<LabourRateDto>(`/reference/cost-rates/machining-labour-rates/${id}/`, patch)
    set((s) => {
      const labourRates = s.labourRates.map((r) => (r.id === id ? updated : r))
      return { labourRates, costRates: buildCostRates(s.globalParameters, s.materialRates, labourRates, s.logisticsRates) }
    })
  },
  deleteLabourRate: async (id) => {
    await api.delete(`/reference/cost-rates/machining-labour-rates/${id}/`)
    set((s) => {
      const labourRates = s.labourRates.filter((r) => r.id !== id)
      return { labourRates, costRates: buildCostRates(s.globalParameters, s.materialRates, labourRates, s.logisticsRates) }
    })
  },

  createLogisticsRate: async (input) => {
    const created = await api.post<LogisticsRateDto>('/reference/cost-rates/logistics-packing-rates/', input)
    set((s) => {
      const logisticsRates = [...s.logisticsRates, created]
      return { logisticsRates, costRates: buildCostRates(s.globalParameters, s.materialRates, s.labourRates, logisticsRates) }
    })
  },
  updateLogisticsRate: async (id, patch) => {
    const updated = await api.patch<LogisticsRateDto>(`/reference/cost-rates/logistics-packing-rates/${id}/`, patch)
    set((s) => {
      const logisticsRates = s.logisticsRates.map((r) => (r.id === id ? updated : r))
      return { logisticsRates, costRates: buildCostRates(s.globalParameters, s.materialRates, s.labourRates, logisticsRates) }
    })
  },
  deleteLogisticsRate: async (id) => {
    await api.delete(`/reference/cost-rates/logistics-packing-rates/${id}/`)
    set((s) => {
      const logisticsRates = s.logisticsRates.filter((r) => r.id !== id)
      return { logisticsRates, costRates: buildCostRates(s.globalParameters, s.materialRates, s.labourRates, logisticsRates) }
    })
  },
}))
