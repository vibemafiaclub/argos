import { BarChart3, Activity, Coins } from 'lucide-react'
import { TopUserCard } from './top-user-card'
import { formatTokens } from '@/lib/format'
import type { WeeklyTopUsers } from '@/types/reports'

interface UsageScaleGroupProps {
  topUsers: WeeklyTopUsers
}

export function UsageScaleGroup({ topUsers }: UsageScaleGroupProps) {
  const { usageScale, eligibleUserCount } = topUsers

  if (eligibleUserCount < 1) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-brand-2">
        <BarChart3 className="h-4 w-4" />
        <h3 className="text-sm font-medium">이번 주 활용 규모</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TopUserCard
          icon={<Activity className="h-4 w-4" />}
          label="세션 최다"
          leader={usageScale.sessionCount}
          formatValue={(n) => `${n.toLocaleString()} 세션`}
          tone="scale"
        />
        <TopUserCard
          icon={<Coins className="h-4 w-4" />}
          label="토큰 최다"
          leader={usageScale.tokenUsage}
          formatValue={(n) => formatTokens(n)}
          tone="scale"
        />
      </div>
    </div>
  )
}
