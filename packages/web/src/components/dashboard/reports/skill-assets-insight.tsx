import { Sparkles } from 'lucide-react'
import { ChartCard } from '@/components/dashboard/chart-card'
import type { WeeklyInsights } from '@/types/reports'

interface SkillAssetsInsightProps {
  insight: WeeklyInsights['skillAssets']
}

export function SkillAssetsInsight({ insight }: SkillAssetsInsightProps) {
  return (
    <ChartCard
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          재사용 자산
        </span>
      }
      description={`이번 주 스킬 호출 ${insight.totalCalls.toLocaleString()}회 · 고유 스킬 ${insight.distinctSkills}개`}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-2">
            최근 잊혀진 스킬
            <span className="ml-1">
              (4주 이내 사용된 적 있지만 이번 주 0회)
            </span>
          </div>
          {insight.forgottenSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              이번 주 모든 최근 스킬이 활용되었습니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {insight.forgottenSkills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ChartCard>
  )
}
