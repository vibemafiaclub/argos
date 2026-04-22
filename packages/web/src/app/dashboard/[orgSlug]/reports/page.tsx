'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useWeeklyReport } from '@/hooks/use-weekly-report'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChartCard } from '@/components/dashboard/chart-card'
import { SkillFrequencyChart } from '@/components/dashboard/skill-frequency-chart'
import { ModelShareChart } from '@/components/dashboard/model-share-chart'
import { WeekNavigator } from '@/components/dashboard/reports/week-navigator'
import { WeeklyKpiCards } from '@/components/dashboard/reports/weekly-kpi-cards'
import { WeeklyFlowChart } from '@/components/dashboard/reports/weekly-flow-chart'
import { LearnFromGroup } from '@/components/dashboard/reports/learn-from-group'
import { UsageScaleGroup } from '@/components/dashboard/reports/usage-scale-group'
import { DelegationInsight } from '@/components/dashboard/reports/delegation-insight'
import { SkillAssetsInsight } from '@/components/dashboard/reports/skill-assets-insight'
import { ContextSection } from '@/components/dashboard/reports/context-section'
import { EmptyWeekState } from '@/components/dashboard/reports/empty-week-state'

function ReportsContent({ orgSlug }: { orgSlug: string }) {
  const searchParams = useSearchParams()
  const weekParam = searchParams.get('week') ?? undefined
  const projectId = searchParams.get('projectId') ?? undefined

  const { data, isLoading, error, refetch } = useWeeklyReport(orgSlug, {
    projectId,
    week: weekParam,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>리포트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { week, kpis, insights, topUsers, trendContext } = data
  const hasAnyActivity = kpis.sessionCount > 0 || kpis.activeUserCount > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            팀의 AI 활용 주간 인사이트 · TOP 활용자
          </p>
        </div>
        <WeekNavigator
          currentIsoKey={week.isoKey}
          label={week.label}
          isCurrent={week.isCurrent}
        />
      </div>

      {week.isCurrent && (
        <Alert>
          <AlertDescription>
            이번 주는 아직 진행 중입니다. 집계는 현재까지의 데이터 기준이며 주 종료 후 확정됩니다.
          </AlertDescription>
        </Alert>
      )}

      {!hasAnyActivity ? (
        <EmptyWeekState
          title="이번 주 활동 없음"
          message={
            projectId
              ? '선택된 프로젝트에 이번 주 수집된 데이터가 없습니다.'
              : '이번 주 수집된 활동이 없습니다. 다른 주를 선택해 보세요.'
          }
          action={
            projectId ? (
              <Link
                href={`/dashboard/${orgSlug}/reports?week=${week.isoKey}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                프로젝트 필터 해제
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ① 이번 주 인사이트 */}
          <div className="space-y-3">
            <h2 className="text-base font-medium">이번 주 인사이트</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DelegationInsight insight={insights.delegation} orgSlug={orgSlug} />
              <SkillAssetsInsight insight={insights.skillAssets} />
            </div>
          </div>

          {/* ② TOP 활용자 */}
          <div className="space-y-4">
            <h2 className="text-base font-medium">TOP 활용자</h2>
            <LearnFromGroup topUsers={topUsers} />
            <UsageScaleGroup topUsers={topUsers} />
            {topUsers.eligibleUserCount < 1 && (
              <p className="text-xs text-muted-foreground">
                랭킹 대상 사용자가 부족합니다 (주간 세션 3+ 필요).
              </p>
            )}
          </div>

          {/* ③ 맥락 지표 — fold */}
          <ContextSection title="맥락 지표 (KPI · 주간 흐름 · 스킬/에이전트 TOP)">
            <div className="space-y-4">
              <WeeklyKpiCards kpis={kpis} hideDelta={week.isFirst} />

              <ChartCard
                title="주간 흐름"
                description={
                  week.isFirst
                    ? '지난 주 데이터가 없어 비교 불가. 이번 주 흐름만 표시됩니다.'
                    : '요일별 총 토큰 사용량. 막대=이번 주, 라인=지난 주.'
                }
              >
                <WeeklyFlowChart
                  thisWeek={trendContext.thisWeekSeries}
                  prevWeek={week.isFirst ? [] : trendContext.prevWeekSeries}
                />
              </ChartCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard
                  title="Skill 호출 빈도"
                  description="이번 주 가장 많이 호출된 스킬 Top 10"
                >
                  <SkillFrequencyChart data={trendContext.topSkills} />
                </ChartCard>
                <ChartCard
                  title="Model 점유율"
                  description="이번 주 모델별 billable 토큰 점유율"
                >
                  <ModelShareChart data={trendContext.modelShare} />
                </ChartCard>
              </div>
            </div>
          </ContextSection>
        </>
      )}
    </div>
  )
}

export default function OrgReportsPage() {
  const params = useParams()
  const orgSlug = params.orgSlug as string

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <ReportsContent orgSlug={orgSlug} />
    </Suspense>
  )
}
