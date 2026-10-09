import { create } from 'zustand'
import { api } from '@/lib/apiClient'

/**
 * Catalogs (bearings/sleeves/housings/lagging/locking-devices), Raw Forging Prices,
 * and the In-House Hours legend table — all backend-editable (add/delete), separate
 * from formulaStore (formulas + the Technical Data Sheet's field schema, which are a
 * different concept). Same loaded/loading/silent-catch contract as every other store
 * here — see formulaStore.ts's note on why.
 */

export interface BearingCatalogDto {
  id: number
  designation: string
  bore_mm: number
  price_inr: number
  price_eur: number
  delivery_days: number
}

export interface SleeveCatalogDto {
  id: number
  for_bearing: string
  sleeve_code: string
  price_eur: number
  price_inr: number
}

export interface HousingCatalogDto {
  id: number
  for_bearing: string
  housing_designation: string
  price_inr: number
  delivery_days: number
}

export interface LaggingCatalogDto {
  id: number
  /** Unique within Lagging only (unlike the 4 Cost Rate Tables keys, this one's editable). */
  key: string
  lagging_type: string
  thickness_mm: number
  price_inr_per_m2: number
  delivery_days: number
  description: string
}

export interface LockingDeviceCatalogDto {
  id: number
  /** Unique — the backend rejects a duplicate with a 400 on this field. */
  model_size: string
  /** Free text, e.g. "₹25,000 – ₹35,000" — a range, not a number. */
  indicative_price: string
  negotiated_rate_inr: number
  remarks: string
  updated_at: string
}

export interface ShaftBandDto {
  id: number
  material: string
  diameter: string
  length: string
  // Text, not number — given as a range (e.g. "175 - 225"), not a single rate.
  as_forge_rate_inr_per_kg: string | null
  // Two extra, diameter+length-specific rate overrides from the client sheet's own
  // "Shaft with Full Machined Scope" table.
  rate_dia_410_lg_3900_inr_per_kg: number | null
  rate_dia_420_800_lg_2000_inr_per_kg: number | null
  order: number
  updated_at: string
}

export interface ShellBandDto {
  id: number
  sourcing: string
  diameter_body: string
  face_width_body: string
  wall_thickness: string
  welded_in_plate_thickness: string
  t_bottom_thickness: string
  plate_rate_inr_per_kg: number | null
  end_disc_hub_rate_inr_per_kg: number | null
  order: number
  updated_at: string
}

export interface InHouseHourRateDto {
  id: number
  cost_head: string
  operation: string
  cost_centre: string
  activity_description: string
  mhr_rate: number
  order: number
}

interface ReferenceState {
  loaded: boolean
  loading: boolean
  bearings: BearingCatalogDto[]
  sleeves: SleeveCatalogDto[]
  housings: HousingCatalogDto[]
  lagging: LaggingCatalogDto[]
  lockingDevices: LockingDeviceCatalogDto[]
  shaftBands: ShaftBandDto[]
  shellBands: ShellBandDto[]
  inHouseHourRates: InHouseHourRateDto[]

  loadAll: () => Promise<void>

  createBearing: (input: Omit<BearingCatalogDto, 'id'>) => Promise<void>
  updateBearing: (id: number, patch: Partial<Omit<BearingCatalogDto, 'id'>>) => Promise<void>
  deleteBearing: (id: number) => Promise<void>
  createSleeve: (input: Omit<SleeveCatalogDto, 'id'>) => Promise<void>
  updateSleeve: (id: number, patch: Partial<Omit<SleeveCatalogDto, 'id'>>) => Promise<void>
  deleteSleeve: (id: number) => Promise<void>
  createHousing: (input: Omit<HousingCatalogDto, 'id'>) => Promise<void>
  updateHousing: (id: number, patch: Partial<Omit<HousingCatalogDto, 'id'>>) => Promise<void>
  deleteHousing: (id: number) => Promise<void>
  createLagging: (input: Omit<LaggingCatalogDto, 'id'>) => Promise<void>
  updateLagging: (id: number, patch: Partial<Pick<LaggingCatalogDto, 'lagging_type' | 'thickness_mm' | 'price_inr_per_m2' | 'delivery_days'>>) => Promise<void>
  deleteLagging: (id: number) => Promise<void>
  createLockingDevice: (input: Omit<LockingDeviceCatalogDto, 'id' | 'updated_at'>) => Promise<void>
  updateLockingDevice: (
    id: number,
    patch: Partial<Pick<LockingDeviceCatalogDto, 'model_size' | 'indicative_price' | 'negotiated_rate_inr' | 'remarks'>>,
  ) => Promise<void>
  deleteLockingDevice: (id: number) => Promise<void>

  createShaftBand: (input: Omit<ShaftBandDto, 'id' | 'updated_at'>) => Promise<void>
  updateShaftBand: (id: number, patch: Partial<Omit<ShaftBandDto, 'id' | 'updated_at'>>) => Promise<void>
  deleteShaftBand: (id: number) => Promise<void>

  createShellBand: (input: Omit<ShellBandDto, 'id' | 'updated_at'>) => Promise<void>
  updateShellBand: (id: number, patch: Partial<Omit<ShellBandDto, 'id' | 'updated_at'>>) => Promise<void>
  deleteShellBand: (id: number) => Promise<void>

  createInHouseHourRate: (input: Omit<InHouseHourRateDto, 'id'>) => Promise<void>
  updateInHouseHourRate: (id: number, patch: Partial<InHouseHourRateDto>) => Promise<void>
  deleteInHouseHourRate: (id: number) => Promise<void>
}

export const useReferenceStore = create<ReferenceState>((set, get) => ({
  loaded: false,
  loading: false,
  bearings: [],
  sleeves: [],
  housings: [],
  lagging: [],
  lockingDevices: [],
  shaftBands: [],
  shellBands: [],
  inHouseHourRates: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [bearings, sleeves, housings, lagging, lockingDevices, shaftBands, shellBands, inHouseHourRates] = await Promise.all([
        api.get<BearingCatalogDto[]>('/reference/catalogs/bearings/'),
        api.get<SleeveCatalogDto[]>('/reference/catalogs/sleeves/'),
        api.get<HousingCatalogDto[]>('/reference/catalogs/housings/'),
        api.get<LaggingCatalogDto[]>('/reference/cost-rates/lagging-rates/'),
        api.get<LockingDeviceCatalogDto[]>('/reference/catalogs/lcd-data/'),
        api.get<ShaftBandDto[]>('/reference/raw-forging/shaft-bands/'),
        api.get<ShellBandDto[]>('/reference/raw-forging/shell-bands/'),
        api.get<InHouseHourRateDto[]>('/reference/in-house-hours/'),
      ])
      set({ bearings, sleeves, housings, lagging, lockingDevices, shaftBands, shellBands, inHouseHourRates, loaded: true, loading: false })
    } catch {
      // Backend not running/deployed — leave `loaded: false` so getOptionsForField()/
      // lookupCatalogPrice() use their static fallback. See pulleyTechDataSchema.ts.
      set({ loading: false })
    }
  },

  createBearing: async (input) => {
    const created = await api.post<BearingCatalogDto>('/reference/catalogs/bearings/', input)
    set((s) => ({ bearings: [...s.bearings, created] }))
  },
  updateBearing: async (id, patch) => {
    const updated = await api.patch<BearingCatalogDto>(`/reference/catalogs/bearings/${id}/`, patch)
    set((s) => ({ bearings: s.bearings.map((b) => (b.id === id ? updated : b)) }))
  },
  deleteBearing: async (id) => {
    await api.delete(`/reference/catalogs/bearings/${id}/`)
    set((s) => ({ bearings: s.bearings.filter((b) => b.id !== id) }))
  },

  createSleeve: async (input) => {
    const created = await api.post<SleeveCatalogDto>('/reference/catalogs/sleeves/', input)
    set((s) => ({ sleeves: [...s.sleeves, created] }))
  },
  updateSleeve: async (id, patch) => {
    const updated = await api.patch<SleeveCatalogDto>(`/reference/catalogs/sleeves/${id}/`, patch)
    set((s) => ({ sleeves: s.sleeves.map((x) => (x.id === id ? updated : x)) }))
  },
  deleteSleeve: async (id) => {
    await api.delete(`/reference/catalogs/sleeves/${id}/`)
    set((s) => ({ sleeves: s.sleeves.filter((x) => x.id !== id) }))
  },

  createHousing: async (input) => {
    const created = await api.post<HousingCatalogDto>('/reference/catalogs/housings/', input)
    set((s) => ({ housings: [...s.housings, created] }))
  },
  updateHousing: async (id, patch) => {
    const updated = await api.patch<HousingCatalogDto>(`/reference/catalogs/housings/${id}/`, patch)
    set((s) => ({ housings: s.housings.map((x) => (x.id === id ? updated : x)) }))
  },
  deleteHousing: async (id) => {
    await api.delete(`/reference/catalogs/housings/${id}/`)
    set((s) => ({ housings: s.housings.filter((x) => x.id !== id) }))
  },

  createLagging: async (input) => {
    const created = await api.post<LaggingCatalogDto>('/reference/cost-rates/lagging-rates/', input)
    set((s) => ({ lagging: [...s.lagging, created] }))
  },
  updateLagging: async (id, patch) => {
    const updated = await api.patch<LaggingCatalogDto>(`/reference/cost-rates/lagging-rates/${id}/`, patch)
    set((s) => ({ lagging: s.lagging.map((x) => (x.id === id ? updated : x)) }))
  },
  deleteLagging: async (id) => {
    await api.delete(`/reference/cost-rates/lagging-rates/${id}/`)
    set((s) => ({ lagging: s.lagging.filter((x) => x.id !== id) }))
  },

  createLockingDevice: async (input) => {
    const created = await api.post<LockingDeviceCatalogDto>('/reference/catalogs/lcd-data/', input)
    set((s) => ({ lockingDevices: [...s.lockingDevices, created] }))
  },
  updateLockingDevice: async (id, patch) => {
    const updated = await api.patch<LockingDeviceCatalogDto>(`/reference/catalogs/lcd-data/${id}/`, patch)
    set((s) => ({ lockingDevices: s.lockingDevices.map((x) => (x.id === id ? updated : x)) }))
  },
  deleteLockingDevice: async (id) => {
    await api.delete(`/reference/catalogs/lcd-data/${id}/`)
    set((s) => ({ lockingDevices: s.lockingDevices.filter((x) => x.id !== id) }))
  },

  createShaftBand: async (input) => {
    const created = await api.post<ShaftBandDto>('/reference/raw-forging/shaft-bands/', input)
    set((s) => ({ shaftBands: [...s.shaftBands, created] }))
  },
  updateShaftBand: async (id, patch) => {
    const updated = await api.patch<ShaftBandDto>(`/reference/raw-forging/shaft-bands/${id}/`, patch)
    set((s) => ({ shaftBands: s.shaftBands.map((r) => (r.id === id ? updated : r)) }))
  },
  deleteShaftBand: async (id) => {
    await api.delete(`/reference/raw-forging/shaft-bands/${id}/`)
    set((s) => ({ shaftBands: s.shaftBands.filter((x) => x.id !== id) }))
  },

  createShellBand: async (input) => {
    const created = await api.post<ShellBandDto>('/reference/raw-forging/shell-bands/', input)
    set((s) => ({ shellBands: [...s.shellBands, created] }))
  },
  updateShellBand: async (id, patch) => {
    const updated = await api.patch<ShellBandDto>(`/reference/raw-forging/shell-bands/${id}/`, patch)
    set((s) => ({ shellBands: s.shellBands.map((r) => (r.id === id ? updated : r)) }))
  },
  deleteShellBand: async (id) => {
    await api.delete(`/reference/raw-forging/shell-bands/${id}/`)
    set((s) => ({ shellBands: s.shellBands.filter((x) => x.id !== id) }))
  },

  createInHouseHourRate: async (input) => {
    const created = await api.post<InHouseHourRateDto>('/reference/in-house-hours/', input)
    set((s) => ({ inHouseHourRates: [...s.inHouseHourRates, created] }))
  },
  updateInHouseHourRate: async (id, patch) => {
    const updated = await api.patch<InHouseHourRateDto>(`/reference/in-house-hours/${id}/`, patch)
    set((s) => ({ inHouseHourRates: s.inHouseHourRates.map((r) => (r.id === id ? updated : r)) }))
  },
  deleteInHouseHourRate: async (id) => {
    await api.delete(`/reference/in-house-hours/${id}/`)
    set((s) => ({ inHouseHourRates: s.inHouseHourRates.filter((x) => x.id !== id) }))
  },
}))
