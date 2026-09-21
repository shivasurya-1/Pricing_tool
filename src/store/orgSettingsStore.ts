import { create } from 'zustand'
import { api } from '@/lib/apiClient'

/**
 * Real Settings-page data — one singleton object, not a list (see
 * backend/reference/models.py::OrganizationSettings). Same loaded/loading/
 * silent-catch contract as every other store here, but `update` patches a
 * single object rather than an array of rows.
 */

export interface OrgSettingsDto {
  company_name: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  phone: string
  email: string
  website: string
  tax_registration_number: string
  logo_url: string
  default_currency: 'INR' | 'USD' | 'EUR' | 'GBP'
  tax_registration_label: string
  default_tax_applicability: string
  sla_days_operations_review: number | null
  sla_days_sourcing: number | null
  sla_days_controlling: number | null
  sla_days_approval: number | null
  notify_on_stage_change: boolean
  notify_email_enabled: boolean
  quotation_header_text: string
  quotation_footer_text: string
  quotation_validity_days_default: number | null
  terms_and_conditions_text: string
  updated_at: string
}

interface OrgSettingsState {
  loaded: boolean
  loading: boolean
  settings: OrgSettingsDto | null

  loadAll: () => Promise<void>
  updateSettings: (patch: Partial<OrgSettingsDto>) => Promise<void>
}

export const useOrgSettingsStore = create<OrgSettingsState>((set, get) => ({
  loaded: false,
  loading: false,
  settings: null,

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const settings = await api.get<OrgSettingsDto>('/reference/organization-settings/')
      set({ settings, loaded: true, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  updateSettings: async (patch) => {
    const updated = await api.patch<OrgSettingsDto>('/reference/organization-settings/', patch)
    set({ settings: updated })
  },
}))
