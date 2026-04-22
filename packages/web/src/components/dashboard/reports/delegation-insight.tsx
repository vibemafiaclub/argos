import Link from 'next/link'
import { Wand2, ArrowUpRight } from 'lucide-react'
import { ChartCard } from '@/components/dashboard/chart-card'
import { StatList, StatListRow } from '@/components/dashboard/stat-list'
import type { WeeklyInsights } from '@/types/reports'

interface DelegationInsightProps {
  insight: WeeklyInsights['delegation']
  orgSlug: string
}

export function DelegationInsight({ insight, orgSlug }: DelegationInsightProps) {
  if (insight.taskCount === 0) {
    return (
      <ChartCard
        title={
          <span className="inline-flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-brand-2" />
            위임 활용
          </span>
        }
        description="Task / Agent 도구로 서브에이전트에 넓은 탐색·조회를 위임하면 메인 컨텍스트 오염을 줄일 수 있습니다."
      >
        <p className="text-sm text-muted-foreground py-4">
          이번 주 위임 활용 없음
        </p>
      </ChartCard>
    )
  }

  const maxCount = Math.max(1, ...insight.topAgents.map((a) => a.callCount))

  return (
    <ChartCard
      title={
        <span className="inline-flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-brand-2" />
          위임 활용
        </span>
      }
      description={`이번 주 Task 도구 ${insight.taskCount.toLocaleString()}회 호출.`}
    >
      <div className="flex flex-col gap-3">
        {insight.topAgents.length > 0 && (
          <StatList>
            {insight.topAgents.map((a) => (
              <StatListRow
                key={a.agentType}
                label={a.agentType}
                value={`${a.callCount.toLocaleString()}회`}
                percent={(a.callCount / maxCount) * 100}
                tone="brand-2"
              />
            ))}
          </StatList>
        )}
        {insight.sampleSessionIds.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">효과적 위임 사례</div>
            <div className="flex flex-wrap gap-2">
              {insight.sampleSessionIds.map((sid) => (
                <Link
                  key={sid}
                  href={`/dashboard/${orgSlug}/sessions/${sid}`}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-card-elevated transition-colors font-mono truncate max-w-[12rem]"
                >
                  <span className="truncate">{sid.slice(0, 10)}…</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </ChartCard>
  )
}
