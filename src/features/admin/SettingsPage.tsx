import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'

const TABS = ['Company Profile', 'Currency', 'Tax Settings', 'Workflow Settings', 'Notification Preferences', 'Quotation Template', 'Terms & Conditions']

export function SettingsPage() {
  const [tab, setTab] = useState(TABS[0])
  const [confirmReset, setConfirmReset] = useState(false)
  const resetDemoData = useDataStore((s) => s.resetDemoData)
  const pushToast = useUiStore((s) => s.pushToast)

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Frontend placeholders — no backend persistence in this prototype"
        actions={
          <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)}>
            Reset Demo Data
          </Button>
        }
      />

      <Card>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="p-6">
          <EmptyState title={tab} description="This settings area is a placeholder in the prototype — no backend persistence is wired up yet." />
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
