import { formatTokens } from '@/lib/format'
import { MetricCard, MetricBar } from '@/components/dashboard/metric-card'
import type { WeeklyKpis } from '@/types/reports'

interface WeeklyKpiCardsProps {
  kpis: WeeklyKpis
  /** 첫 주(비교 불가) 또는 지난 주 데이터가 없을 때 delta 숨김 */
  hideDelta?: boolean
}

export function WeeklyKpiCards({ kpis, hideDelta = false }: WeeklyKpiCardsProps) {
  return (
    <MetricBar>
      <MetricCard
        label="Sessions"
        value={kpis.sessionCount.toLocaleString()}
        change={hideDelta ? undefined : kpis.wow.sessions}
      />
      <MetricCard
        label="Turns"
        value={kpis.turnCount.toLocaleString()}
        change={hideDelta ? undefined : kpis.wow.turns}
      />
      <MetricCard
        label="Active users"
        value={kpis.activeUserCount.toLocaleString()}
        change={hideDelta ? undefined : kpis.wow.activeUsers}
      />
      <MetricCard
        label="Tokens"
        value={formatTokens(kpis.totalTokens)}
        change={hideDelta ? undefined : kpis.wow.tokens}
      />
    </MetricBar>
  )
}
