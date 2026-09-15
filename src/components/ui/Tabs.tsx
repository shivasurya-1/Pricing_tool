import clsx from 'clsx'

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] px-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={clsx(
            'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === tab
              ? 'border-[var(--color-blue)] text-[var(--color-blue)]'
              : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]',
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
