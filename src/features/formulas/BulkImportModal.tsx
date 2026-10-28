import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Check, Download, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { api, ApiError, downloadFile } from '@/lib/apiClient'
import { useFormulaStore } from '@/store/formulaStore'
import { useUiStore } from '@/store/uiStore'

type RowStatus = 'created' | 'skipped' | 'error'

interface SectionRow {
  row: number
  label: string
  sheet: 'pricing_tool' | 'tech_sheet' | null
  order: number | null
  status: RowStatus
  message: string
}

interface FieldRow {
  row: number
  key: string
  label: string
  section: string
  type: string
  auto: boolean
  status: RowStatus
  message: string
}

/** POST /api/formulas/bulk-import/ — see backend/formulas/bulk_import.py. A dry run
 * reports what each row would do ("created" = will be added) without saving. */
interface BulkImportResult {
  dry_run: boolean
  saved: boolean
  summary: { sections_created: number; sections_skipped: number; fields_created: number; fields_skipped: number; errors: number }
  sections: SectionRow[]
  fields: FieldRow[]
  errors: { sheet: 'Sections' | 'Fields'; row: number; message: string }[]
}

const SHEET_LABELS = { pricing_tool: 'Pricing Tool', tech_sheet: 'Technical Sheet' } as const
const STEPS = ['Template', 'Upload', 'Review', 'Confirm']

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-[var(--color-green)] text-white',
                active && 'bg-[var(--color-blue)] text-white',
                !done && !active && 'border border-[var(--color-border)] text-[var(--color-ink-faint)]',
              )}
            >
              {done ? <Check size={13} /> : i + 1}
            </span>
            <span className={clsx('whitespace-nowrap text-xs font-medium', active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)]')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className={clsx('h-px flex-1', done ? 'bg-[var(--color-green)]' : 'bg-[var(--color-border)]')} />}
          </li>
        )
      })}
    </ol>
  )
}

function StatTile({ value, label, tone }: { value: number; label: string; tone: 'green' | 'neutral' | 'red' }) {
  return (
    <div
      className={clsx(
        'rounded-md border px-3 py-2.5',
        tone === 'green' && 'border-[var(--color-green-100)] bg-[var(--color-green-50)] text-[var(--color-green)]',
        tone === 'red' && 'border-[var(--color-red-100)] bg-[var(--color-red-50)] text-[var(--color-red)]',
        tone === 'neutral' && 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)]',
      )}
    >
      <p className="text-xl font-semibold leading-tight">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === 'created') return <Badge tone="green">Will be added</Badge>
  if (status === 'skipped') return <Badge tone="neutral">Already exists</Badge>
  return <Badge tone="red">Error</Badge>
}

const thClass = 'px-3 py-2 text-left text-xs font-medium uppercase text-[var(--color-ink-faint)]'
const tdClass = 'px-3 py-2 align-top text-sm'

function PreviewTable<T extends { row: number; status: RowStatus; message: string }>({
  rows,
  columns,
}: {
  rows: T[]
  columns: { title: string; render: (r: T) => ReactNode; className?: string }[]
}) {
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-sm text-[var(--color-ink-faint)]">No rows on this sheet.</p>
  return (
    <div className="max-h-[38vh] overflow-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead className="sticky top-0 bg-[var(--color-surface)]">
          <tr>
            <th className={clsx(thClass, 'w-14')}>Row</th>
            {columns.map((c) => (
              <th key={c.title} className={thClass}>
                {c.title}
              </th>
            ))}
            <th className={clsx(thClass, 'w-36')}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row} className={clsx('border-t border-[var(--color-border)]', r.status === 'error' && 'bg-[var(--color-red-50)]')}>
              <td className={clsx(tdClass, 'text-[var(--color-ink-faint)]')}>{r.row}</td>
              {columns.map((c, i) => (
                <td key={c.title} className={clsx(tdClass, c.className)}>
                  {c.render(r)}
                  {i === 0 && r.status === 'error' && <p className="mt-1 text-xs text-[var(--color-red)]">{r.message}</p>}
                  {/* e.g. a dropdown imported without choices — added later with Edit */}
                  {i === 0 && r.status === 'created' && r.message && <p className="mt-1 text-xs text-[var(--color-amber)]">{r.message}</p>}
                </td>
              ))}
              <td className={tdClass}>
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Adds many Sections and Fields from one Excel file: download the template, fill it
 * in, upload it (a dry run previews every row and error), then confirm to save. */
export function BulkImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const loadAll = useFormulaStore((s) => s.loadAll)
  const pushToast = useUiStore((s) => s.pushToast)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BulkImportResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [templateDownloaded, setTemplateDownloaded] = useState(false)
  const [tab, setTab] = useState<'sections' | 'fields'>('sections')
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setTemplateDownloaded(false)
    setTab('sections')
    if (inputRef.current) inputRef.current.value = ''
  }
  const close = () => {
    reset()
    onClose()
  }

  const send = async (upload: File, dryRun: boolean) => {
    const form = new FormData()
    form.append('file', upload)
    form.append('dry_run', dryRun ? 'true' : 'false')
    return api.postForm<BulkImportResult>('/formulas/bulk-import/', form)
  }

  // Uploading a file immediately shows its preview (a dry run — nothing saved yet).
  const handleUpload = async (upload: File | null) => {
    if (!upload) return
    if (!upload.name.toLowerCase().endsWith('.xlsx')) {
      pushToast('Upload an Excel .xlsx file — download the template to start.', 'error')
      return
    }
    setFile(upload)
    setPreview(null)
    setChecking(true)
    try {
      const result = await send(upload, true)
      setPreview(result)
      // Open the tab that needs attention: the first one with an error, else one with rows.
      const fieldsFirst = result.errors.length > 0 ? result.errors[0].sheet === 'Fields' : result.sections.length === 0
      setTab(fieldsFirst ? 'fields' : 'sections')
    } catch (err) {
      setFile(null)
      pushToast(err instanceof ApiError ? err.message : 'Failed to read the file.', 'error')
    } finally {
      setChecking(false)
      // Cleared so picking the same (now corrected) file again still triggers onChange.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (!checking) void handleUpload(e.dataTransfer.files?.[0] ?? null)
  }

  const handleConfirm = async () => {
    if (!file) return
    setSaving(true)
    try {
      const result = await send(file, false)
      await loadAll()
      const { sections_created, fields_created } = result.summary
      pushToast(`Imported ${plural(sections_created, 'section')} and ${plural(fields_created, 'field')}.`, 'success')
      close()
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Import failed.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTemplate = async () => {
    try {
      await downloadFile('/formulas/bulk-import/template/', 'formulas-bulk-import-template.xlsx')
      setTemplateDownloaded(true)
    } catch (err) {
      pushToast(err instanceof ApiError ? err.message : 'Failed to download the template.', 'error')
    }
  }

  const s = preview?.summary
  const toAdd = s ? s.sections_created + s.fields_created : 0
  const hasErrors = !!preview && preview.errors.length > 0
  const canConfirm = !!preview && !hasErrors && toAdd > 0 && !saving
  const step = canConfirm ? 3 : preview ? 2 : file || templateDownloaded ? 1 : 0

  const sectionErrors = preview?.errors.filter((e) => e.sheet === 'Sections').length ?? 0
  const fieldErrors = preview?.errors.filter((e) => e.sheet === 'Fields').length ?? 0
  const tabLabels = {
    sections: `Sections (${preview?.sections.length ?? 0})${sectionErrors ? ` · ${sectionErrors} error${sectionErrors === 1 ? '' : 's'}` : ''}`,
    fields: `Fields (${preview?.fields.length ?? 0})${fieldErrors ? ` · ${fieldErrors} error${fieldErrors === 1 ? '' : 's'}` : ''}`,
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk Import — Sections & Fields"
      width="max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-ink-faint)]">
            {hasErrors ? 'Fix the errors in the file and upload it again.' : 'Nothing is saved until you confirm.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" icon={saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} onClick={handleConfirm} disabled={!canConfirm}>
              {saving ? 'Saving...' : toAdd > 0 && !hasErrors ? `Confirm ${plural(toAdd, 'item')}` : 'Confirm'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Stepper current={step} />

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-green-50)] text-[var(--color-green)]">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-ink)]">Excel template</p>
            <p className="text-xs text-[var(--color-ink-faint)]">Sections and Fields sheets with example rows — replace the yellow examples with your own.</p>
          </div>
          <Button size="sm" variant="secondary" icon={templateDownloaded ? <Check size={13} /> : <Download size={13} />} onClick={handleTemplate}>
            {templateDownloaded ? 'Downloaded' : 'Download'}
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            {checking ? (
              <Loader2 size={18} className="shrink-0 animate-spin text-[var(--color-blue)]" />
            ) : (
              <FileSpreadsheet size={18} className="shrink-0 text-[var(--color-green)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-ink)]">{file.name}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">{checking ? 'Checking every row...' : formatSize(file.size)}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={checking || saving}>
              Change file
            </Button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={clsx(
              'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragOver
                ? 'border-[var(--color-blue)] bg-[var(--color-blue-50)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)]',
            )}
          >
            <UploadCloud size={28} className="text-[var(--color-blue)]" />
            <p className="text-sm font-medium text-[var(--color-ink)]">Drag your filled-in .xlsx here</p>
            <p className="text-xs text-[var(--color-ink-faint)]">or click to browse — a preview appears right away</p>
          </div>
        )}

        {preview && s && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile value={s.sections_created} label="Sections to add" tone="green" />
              <StatTile value={s.fields_created} label="Fields to add" tone="green" />
              <StatTile value={s.sections_skipped + s.fields_skipped} label="Already exist (skipped)" tone="neutral" />
              <StatTile value={s.errors} label={s.errors === 1 ? 'Error' : 'Errors'} tone={s.errors > 0 ? 'red' : 'neutral'} />
            </div>

            {!hasErrors && toAdd === 0 && (
              <p className="rounded-md bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
                Everything in this file already exists — there's nothing new to import.
              </p>
            )}

            <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
              <Tabs
                tabs={[tabLabels.sections, tabLabels.fields]}
                active={tabLabels[tab]}
                onChange={(t) => setTab(t === tabLabels.fields ? 'fields' : 'sections')}
              />
              {tab === 'sections' ? (
                <PreviewTable
                  rows={preview.sections}
                  columns={[
                    { title: 'Label', render: (r) => r.label || '—', className: 'font-medium' },
                    { title: 'Sheet', render: (r) => (r.sheet ? SHEET_LABELS[r.sheet] : '—') },
                    { title: 'Order', render: (r) => r.order ?? (r.status === 'created' ? 'Last' : '—') },
                  ]}
                />
              ) : (
                <PreviewTable
                  rows={preview.fields}
                  columns={[
                    { title: 'Label', render: (r) => r.label || '—', className: 'font-medium' },
                    { title: 'Key', render: (r) => r.key || '—', className: 'font-mono text-xs' },
                    { title: 'Section', render: (r) => r.section || '—' },
                    {
                      title: 'Type',
                      render: (r) => (
                        <span className="capitalize">
                          {r.type}
                          {r.auto && (
                            <Badge tone="blue" className="ml-1.5">
                              Auto
                            </Badge>
                          )}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
