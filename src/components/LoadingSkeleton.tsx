export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded bg-[var(--color-surface)]" />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-4">
      <div className="h-3 w-1/2 rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-6 w-1/3 rounded bg-[var(--color-surface)]" />
      <div className="mt-2 h-3 w-1/4 rounded bg-[var(--color-surface)]" />
    </div>
  )
}
