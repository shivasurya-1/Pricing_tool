import { SEQUENTIAL_ORDINAL } from '@/components/charts/palette'

export function StageFunnel({ stages }: { stages: { label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs font-medium text-[var(--color-ink-soft)]">{s.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-[var(--color-surface)]">
            <div
              className="flex h-full items-center justify-end rounded px-2 text-[11px] font-semibold text-white transition-all"
              style={{
                width: `${Math.max(8, (s.count / max) * 100)}%`,
                backgroundColor: SEQUENTIAL_ORDINAL[Math.min(i, SEQUENTIAL_ORDINAL.length - 1)],
              }}
            >
              {s.count}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
