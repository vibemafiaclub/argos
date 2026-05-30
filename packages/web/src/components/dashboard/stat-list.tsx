import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatListRowProps {
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
  percent?: number
  tone?: 'brand' | 'brand-2' | 'muted'
  className?: string
}

const toneStyles: Record<NonNullable<StatListRowProps['tone']>, string> = {
  'brand': 'bg-brand-subtle',
  'brand-2': 'bg-brand-2-subtle',
  muted: 'bg-muted',
}

export const StatListRow = memo(function StatListRow({
  icon,
  label,
  value,
  percent,
  tone = 'brand',
  className,
}: StatListRowProps) {
  const clamped = percent !== undefined ? Math.max(0, Math.min(100, percent)) : undefined

  return (
    <div
      className={cn(
        'group relative flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
        className,
      )}
    >
      {clamped !== undefined && (
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-1 left-1 rounded-sm transition-[width]',
            toneStyles[tone],
          )}
          style={{ width: `calc(${clamped}% - 0.5rem)` }}
        />
      )}
      <div className="relative flex min-w-0 items-center gap-2 truncate">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span className="truncate text-foreground">{label}</span>
      </div>
      <span className="relative shrink-0 tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  )
})

export function StatList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('flex flex-col gap-1', className)}>{children}</div>
}
