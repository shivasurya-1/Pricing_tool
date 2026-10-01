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
  lagging_type: string
  thickness_mm: number
  price_inr_per_m2: number
  delivery_days: number
  description: string
}

export interface LockingDeviceCatalogDto {
  id: number
  model: string
  negotiated_rate_inr: number
  remarks: string
}

export interface RawForgingRateDto {
  id: number
  part: 'shaft' | 'shell'
  material: string
  sourcing: string
  size_band_label: string
  plate_rate_inr_per_kg: number | null
  end_disc_rate_inr_per_kg: number | null
  is_active_default: boolean
  order: number
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
  rawForgingRates: RawForgingRateDto[]
  inHouseHourRates: InHouseHourRateDto[]

  loadAll: () => Promise<void>

  createBearing: (input: Omit<BearingCatalogDto, 'id'>) => Promise<void>
  deleteBearing: (id: number) => Promise<void>
  createSleeve: (input: Omit<SleeveCatalogDto, 'id'>) => Promise<void>
  deleteSleeve: (id: number) => Promise<void>
  createHousing: (input: Omit<HousingCatalogDto, 'id'>) => Promise<void>
  deleteHousing: (id: number) => Promise<void>
  createLagging: (input: Omit<LaggingCatalogDto, 'id'>) => Promise<void>
  deleteLagging: (id: number) => Promise<void>
  createLockingDevice: (input: Omit<LockingDeviceCatalogDto, 'id'>) => Promise<void>
  deleteLockingDevice: (id: number) => Promise<void>

  createRawForgingRate: (input: Omit<RawForgingRateDto, 'id'>) => Promise<void>
  updateRawForgingRate: (id: number, patch: Partial<RawForgingRateDto>) => Promise<void>
  deleteRawForgingRate: (id: number) => Promise<void>

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
  rawForgingRates: [],
  inHouseHourRates: [],

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const [bearings, sleeves, housings, lagging, lockingDevices, rawForgingRates, inHouseHourRates] = await Promise.all([
        api.get<BearingCatalogDto[]>('/reference/catalogs/bearings/'),
        api.get<SleeveCatalogDto[]>('/reference/catalogs/sleeves/'),
        api.get<HousingCatalogDto[]>('/reference/catalogs/housings/'),
        api.get<LaggingCatalogDto[]>('/reference/catalogs/lagging/'),
        api.get<LockingDeviceCatalogDto[]>('/reference/catalogs/locking-devices/'),
        api.get<RawForgingRateDto[]>('/reference/raw-forging-rates/'),
        api.get<InHouseHourRateDto[]>('/reference/in-house-hours/'),
      ])
      set({ bearings, sleeves, housings, lagging, lockingDevices, rawForgingRates, inHouseHourRates, loaded: true, loading: false })
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
  deleteBearing: async (id) => {
    await api.delete(`/reference/catalogs/bearings/${id}/`)
    set((s) => ({ bearings: s.bearings.filter((b) => b.id !== id) }))
  },

  createSleeve: async (input) => {
    const created = await api.post<SleeveCatalogDto>('/reference/catalogs/sleeves/', input)
    set((s) => ({ sleeves: [...s.sleeves, created] }))
  },
  deleteSleeve: async (id) => {
    await api.delete(`/reference/catalogs/sleeves/${id}/`)
    set((s) => ({ sleeves: s.sleeves.filter((x) => x.id !== id) }))
  },

  createHousing: async (input) => {
    const created = await api.post<HousingCatalogDto>('/reference/catalogs/housings/', input)
    set((s) => ({ housings: [...s.housings, created] }))
  },
  deleteHousing: async (id) => {
    await api.delete(`/reference/catalogs/housings/${id}/`)
    set((s) => ({ housings: s.housings.filter((x) => x.id !== id) }))
  },

  createLagging: async (input) => {
    const created = await api.post<LaggingCatalogDto>('/reference/catalogs/lagging/', input)
    set((s) => ({ lagging: [...s.lagging, created] }))
  },
  deleteLagging: async (id) => {
    await api.delete(`/reference/catalogs/lagging/${id}/`)
    set((s) => ({ lagging: s.lagging.filter((x) => x.id !== id) }))
  },

  createLockingDevice: async (input) => {
    const created = await api.post<LockingDeviceCatalogDto>('/reference/catalogs/locking-devices/', input)
    set((s) => ({ lockingDevices: [...s.lockingDevices, created] }))
  },
  deleteLockingDevice: async (id) => {
    await api.delete(`/reference/catalogs/locking-devices/${id}/`)
    set((s) => ({ lockingDevices: s.lockingDevices.filter((x) => x.id !== id) }))
  },

  createRawForgingRate: async (input) => {
    const created = await api.post<RawForgingRateDto>('/reference/raw-forging-rates/', input)
    set((s) => ({ rawForgingRates: [...s.rawForgingRates, created] }))
  },
  updateRawForgingRate: async (id, patch) => {
    const updated = await api.patch<RawForgingRateDto>(`/reference/raw-forging-rates/${id}/`, patch)
    set((s) => ({ rawForgingRates: s.rawForgingRates.map((r) => (r.id === id ? updated : r)) }))
  },
  deleteRawForgingRate: async (id) => {
    await api.delete(`/reference/raw-forging-rates/${id}/`)
    set((s) => ({ rawForgingRates: s.rawForgingRates.filter((x) => x.id !== id) }))
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
