import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LeaderEntry } from '@/types/reports'

interface TopUserCardProps {
  icon: ReactNode
  label: string
  description?: string
  leader: LeaderEntry | null
  formatValue: (n: number) => string
  emptyMessage?: string
  tone?: 'learn' | 'scale'
}

export function TopUserCard({
  icon,
  label,
  description,
  leader,
  formatValue,
  emptyMessage = '대상 없음',
  tone = 'learn',
}: TopUserCardProps) {
  const hasLeader = leader !== null
  const runnerUpDiff =
    hasLeader && leader.runnerUpValue !== null
      ? leader.value - leader.runnerUpValue
      : null

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn(
          'shrink-0',
          tone === 'learn' ? 'text-brand' : 'text-brand-2',
        )}>
          {icon}
        </span>
        <span className="metric-label">{label}</span>
      </div>
      {hasLeader ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground truncate">
              {leader.userName}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="metric-value tabular-nums text-foreground">
              {formatValue(leader.value)}
            </span>
            {runnerUpDiff !== null && runnerUpDiff > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                +{formatValue(runnerUpDiff)} 2위 대비
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center py-4">
          <span className="text-sm text-muted-foreground">{emptyMessage}</span>
        </div>
      )}
    </div>
  )
}
