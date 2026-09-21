import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { useOrgSettingsStore, type OrgSettingsDto } from '@/store/orgSettingsStore'
import { ApiError } from '@/lib/apiClient'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { RequireLoaded } from '@/components/reference/RequireLoaded'

const TABS = ['Company Profile', 'Currency', 'Tax Settings', 'Workflow Settings', 'Notification Preferences', 'Quotation Template', 'Terms & Conditions']

const inputClass = 'w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-blue)]'
const labelClass = 'mb-1 block text-xs font-medium text-[var(--color-ink-soft)]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const [tab, setTab] = useState(TABS[0])
  const [confirmReset, setConfirmReset] = useState(false)
  const resetDemoData = useDataStore((s) => s.resetDemoData)
  const pushToast = useUiStore((s) => s.pushToast)

  const { loaded, loading, settings, loadAll, updateSettings } = useOrgSettingsStore()
  const [draft, setDraft] = useState<OrgSettingsDto | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  const save = async (patch: Partial<OrgSettingsDto>) => {
    setSaving(true)
    try {
      await updateSettings(patch)
      pushToast('Settings saved.', 'success')
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to save settings.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof OrgSettingsDto>(key: K, value: OrgSettingsDto[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization-wide configuration, shared by every user."
        actions={
          <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)}>
            Reset Demo Data
          </Button>
        }
      />

      <Card>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="p-6">
          <RequireLoaded loaded={loaded} loading={loading}>
            {draft && (
              <>
                {tab === 'Company Profile' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Company Name">
                        <input className={inputClass} value={draft.company_name} onChange={(e) => set('company_name', e.target.value)} />
                      </Field>
                      <Field label="Website">
                        <input className={inputClass} value={draft.website} onChange={(e) => set('website', e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Address Line 1">
                        <input className={inputClass} value={draft.address_line1} onChange={(e) => set('address_line1', e.target.value)} />
                      </Field>
                      <Field label="Address Line 2">
                        <input className={inputClass} value={draft.address_line2} onChange={(e) => set('address_line2', e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <Field label="City">
                        <input className={inputClass} value={draft.city} onChange={(e) => set('city', e.target.value)} />
                      </Field>
                      <Field label="State">
                        <input className={inputClass} value={draft.state} onChange={(e) => set('state', e.target.value)} />
                      </Field>
                      <Field label="Postal Code">
                        <input className={inputClass} value={draft.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
                      </Field>
                      <Field label="Country">
                        <input className={inputClass} value={draft.country} onChange={(e) => set('country', e.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <Field label="Phone">
                        <input className={inputClass} value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
                      </Field>
                      <Field label="Email">
                        <input className={inputClass} value={draft.email} onChange={(e) => set('email', e.target.value)} />
                      </Field>
                      <Field label="Tax Registration Number">
                        <input className={inputClass} value={draft.tax_registration_number} onChange={(e) => set('tax_registration_number', e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Logo URL">
                      <input className={inputClass} value={draft.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://..." />
                    </Field>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={() =>
                        save({
                          company_name: draft.company_name,
                          address_line1: draft.address_line1,
                          address_line2: draft.address_line2,
                          city: draft.city,
                          state: draft.state,
                          postal_code: draft.postal_code,
                          country: draft.country,
                          phone: draft.phone,
                          email: draft.email,
                          website: draft.website,
                          tax_registration_number: draft.tax_registration_number,
                          logo_url: draft.logo_url,
                        })
                      }
                    >
                      Save Company Profile
                    </Button>
                  </div>
                )}

                {tab === 'Currency' && (
                  <div className="space-y-4">
                    <Field label="Default Currency">
                      <select
                        className={inputClass}
                        value={draft.default_currency}
                        onChange={(e) => set('default_currency', e.target.value as OrgSettingsDto['default_currency'])}
                      >
                        {(['INR', 'USD', 'EUR', 'GBP'] as const).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      The GST/exchange rate parameters used in pricing calculations live on Cost Rate Tables, not here.
                    </p>
                    <Button variant="primary" disabled={saving} onClick={() => save({ default_currency: draft.default_currency })}>
                      Save Currency
                    </Button>
                  </div>
                )}

                {tab === 'Tax Settings' && (
                  <div className="space-y-4">
                    <Field label="Tax Registration Label">
                      <input
                        className={inputClass}
                        value={draft.tax_registration_label}
                        onChange={(e) => set('tax_registration_label', e.target.value)}
                        placeholder="e.g. GSTIN"
                      />
                    </Field>
                    <Field label="Default Tax Applicability">
                      <input
                        className={inputClass}
                        value={draft.default_tax_applicability}
                        onChange={(e) => set('default_tax_applicability', e.target.value)}
                        placeholder="Suggested note shown when Sales creates a new RFQ"
                      />
                    </Field>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      The actual GST rate used in cost calculations is edited on Cost Rate Tables — this is metadata about how tax is labeled and described.
                    </p>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={() => save({ tax_registration_label: draft.tax_registration_label, default_tax_applicability: draft.default_tax_applicability })}
                    >
                      Save Tax Settings
                    </Button>
                  </div>
                )}

                {tab === 'Workflow Settings' && (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      Target days per stage — informational reference values, not yet enforced with alerts.
                    </p>
                    <div className="grid grid-cols-4 gap-4">
                      <Field label="Operations Review (days)">
                        <input
                          type="number"
                          className={inputClass}
                          value={draft.sla_days_operations_review ?? ''}
                          onChange={(e) => set('sla_days_operations_review', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Sourcing (days)">
                        <input
                          type="number"
                          className={inputClass}
                          value={draft.sla_days_sourcing ?? ''}
                          onChange={(e) => set('sla_days_sourcing', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Controlling (days)">
                        <input
                          type="number"
                          className={inputClass}
                          value={draft.sla_days_controlling ?? ''}
                          onChange={(e) => set('sla_days_controlling', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </Field>
                      <Field label="Approval (days)">
                        <input
                          type="number"
                          className={inputClass}
                          value={draft.sla_days_approval ?? ''}
                          onChange={(e) => set('sla_days_approval', e.target.value === '' ? null : Number(e.target.value))}
                        />
                      </Field>
                    </div>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={() =>
                        save({
                          sla_days_operations_review: draft.sla_days_operations_review,
                          sla_days_sourcing: draft.sla_days_sourcing,
                          sla_days_controlling: draft.sla_days_controlling,
                          sla_days_approval: draft.sla_days_approval,
                        })
                      }
                    >
                      Save Workflow Settings
                    </Button>
                  </div>
                )}

                {tab === 'Notification Preferences' && (
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={draft.notify_on_stage_change} onChange={(e) => set('notify_on_stage_change', e.target.checked)} />
                      Notify on stage change
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={draft.notify_email_enabled} onChange={(e) => set('notify_email_enabled', e.target.checked)} />
                      Send email notifications
                    </label>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      Email notifications aren't wired up to an outbound mail server yet — this toggle is saved for when that ships.
                    </p>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={() => save({ notify_on_stage_change: draft.notify_on_stage_change, notify_email_enabled: draft.notify_email_enabled })}
                    >
                      Save Notification Preferences
                    </Button>
                  </div>
                )}

                {tab === 'Quotation Template' && (
                  <div className="space-y-4">
                    <Field label="Header Text">
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={draft.quotation_header_text}
                        onChange={(e) => set('quotation_header_text', e.target.value)}
                      />
                    </Field>
                    <Field label="Footer Text">
                      <textarea
                        className={inputClass}
                        rows={3}
                        value={draft.quotation_footer_text}
                        onChange={(e) => set('quotation_footer_text', e.target.value)}
                      />
                    </Field>
                    <Field label="Default Validity (days)">
                      <input
                        type="number"
                        className={inputClass}
                        value={draft.quotation_validity_days_default ?? ''}
                        onChange={(e) => set('quotation_validity_days_default', e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </Field>
                    <Button
                      variant="primary"
                      disabled={saving}
                      onClick={() =>
                        save({
                          quotation_header_text: draft.quotation_header_text,
                          quotation_footer_text: draft.quotation_footer_text,
                          quotation_validity_days_default: draft.quotation_validity_days_default,
                        })
                      }
                    >
                      Save Quotation Template
                    </Button>
                  </div>
                )}

                {tab === 'Terms & Conditions' && (
                  <div className="space-y-4">
                    <Field label="Terms & Conditions Text">
                      <textarea
                        className={inputClass}
                        rows={10}
                        value={draft.terms_and_conditions_text}
                        onChange={(e) => set('terms_and_conditions_text', e.target.value)}
                      />
                    </Field>
                    <Button variant="primary" disabled={saving} onClick={() => save({ terms_and_conditions_text: draft.terms_and_conditions_text })}>
                      Save Terms & Conditions
                    </Button>
                  </div>
                )}
              </>
            )}
          </RequireLoaded>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData()
          pushToast('Local prototype settings reset — reloading shared RFQ data from the server.', 'success')
        }}
        title="Reset Local Data"
        description="RFQs, quotations, and masters are now shared data stored on the server — this only resets local prototype settings (users, in-house capability list) and reloads the latest shared data from the server."
        confirmLabel="Reset Local Data"
        danger
      />
    </div>
  )
}
