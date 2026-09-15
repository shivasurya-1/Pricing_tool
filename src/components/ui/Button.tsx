import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  'data-tour'?: string
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-[var(--color-blue)] text-white hover:bg-blue-700 border border-transparent',
  secondary: 'bg-white text-[var(--color-ink)] border border-[var(--color-border)] hover:bg-[var(--color-surface)]',
  danger: 'bg-[var(--color-red)] text-white hover:bg-red-700 border border-transparent',
  success: 'bg-[var(--color-green)] text-white hover:bg-green-700 border border-transparent',
  ghost: 'bg-transparent text-[var(--color-ink-soft)] hover:bg-[var(--color-surface)] border border-transparent',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
