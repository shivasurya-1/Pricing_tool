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

/** The four Cost Rate Tables sections — each its own backend table and endpoint. */
export const COST_RATE_TABLES = {
  global: { path: '/reference/cost-rates/global-parameters/', valueField: 'value' },
  material: { path: '/reference/cost-rates/material-rates/', valueField: 'inr_per_kg' },
  labour: { path: '/reference/cost-rates/machining-labour-rates/', valueField: 'inr_per_hour' },
  logistics: { path: '/reference/cost-rates/logistics-packing-rates/', valueField: 'rate' },
} as const

export type CostRateTableId = keyof typeof COST_RATE_TABLES

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

export interface MachiningLabourRateDto {
  id: number
  key: string
  operation: string
  inr_per_hour: number
  eur_per_hour: number | null
  sourcing_default: string
  order: number
}

export interface LogisticsPackingRateDto {
  id: number
  key: string
  item: string
  rate: number
  unit: string
  notes: string
  order: number
}

export interface CostRateRows {
  global: GlobalParameterDto[]
  material: MaterialRateDto[]
  labour: MachiningLabourRateDto[]
  logistics: LogisticsPackingRateDto[]
}

type CostRateRow = CostRateRows[CostRateTableId][number]

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
  /** Every rate across the four Cost Rate Tables, flattened to key -> value (INR) —
   * what the pricing formulas read. */
  costRates: Record<string, number>
  costRateRows: CostRateRows
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

  createCostRate: <K extends CostRateTableId>(table: K, input: Omit<CostRateRows[K][number], 'id'>) => Promise<void>
  updateCostRate: <K extends CostRateTableId>(table: K, id: number, patch: Partial<Omit<CostRateRows[K][number], 'id' | 'key'>>) => Promise<void>
  deleteCostRate: (table: CostRateTableId, id: number) => Promise<void>
}

const EMPTY_COST_RATE_ROWS: CostRateRows = { global: [], material: [], labour: [], logistics: [] }

function reindexCostRates(costRateRows: CostRateRows) {
  const costRates: Record<string, number> = {}
  for (const table of Object.keys(COST_RATE_TABLES) as CostRateTableId[]) {
    const valueField = COST_RATE_TABLES[table].valueField
    for (const row of costRateRows[table]) costRates[row.key] = Number((row as unknown as Record<string, unknown>)[valueField])
  }
  return { costRateRows, costRates }
}

function withTable<K extends CostRateTableId>(rows: CostRateRows, table: K, next: CostRateRows[K]): CostRateRows {
  return { ...rows, [table]: next }
}

export const useFormulaStore = create<FormulaState>((set, get) => ({
  loaded: false,
  loading: false,
  formulas: {},
  costRates: {},
  costRateRows: EMPTY_COST_RATE_ROWS,
  techDataFields: {},
  sections: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [formulaList, global, material, labour, logistics, fieldList, sections] = await Promise.all([
        api.get<FormulaDefinitionDto[]>('/formulas/'),
        api.get<GlobalParameterDto[]>(COST_RATE_TABLES.global.path),
        api.get<MaterialRateDto[]>(COST_RATE_TABLES.material.path),
        api.get<MachiningLabourRateDto[]>(COST_RATE_TABLES.labour.path),
        api.get<LogisticsPackingRateDto[]>(COST_RATE_TABLES.logistics.path),
        api.get<TechDataFieldDto[]>('/formulas/tech-data-fields/'),
        api.get<SectionDto[]>('/formulas/sections/'),
      ])
      set({
        formulas: Object.fromEntries(formulaList.map((f) => [f.key, f])),
        ...reindexCostRates({ global, material, labour, logistics }),
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

  createCostRate: async (table, input) => {
    const created = await api.post<CostRateRow>(COST_RATE_TABLES[table].path, input)
    set((s) => reindexCostRates(withTable(s.costRateRows, table, [...s.costRateRows[table], created] as CostRateRows[typeof table])))
  },

  updateCostRate: async (table, id, patch) => {
    const updated = await api.patch<CostRateRow>(`${COST_RATE_TABLES[table].path}${id}/`, patch)
    set((s) =>
      reindexCostRates(withTable(s.costRateRows, table, s.costRateRows[table].map((r) => (r.id === id ? updated : r)) as CostRateRows[typeof table])),
    )
  },

  deleteCostRate: async (table, id) => {
    await api.delete(`${COST_RATE_TABLES[table].path}${id}/`)
    set((s) => reindexCostRates(withTable(s.costRateRows, table, s.costRateRows[table].filter((r) => r.id !== id) as CostRateRows[typeof table])))
  },
}))
