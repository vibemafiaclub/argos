'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { subDays, format, differenceInDays } from 'date-fns'
import { ChartCard } from '@/components/dashboard/chart-card'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { OverviewStats } from '@/components/dashboard/overview-stats'
import { DailyWorkChart } from '@/components/dashboard/daily-work-chart'
import { DailyCacheReadsChart } from '@/components/dashboard/daily-cache-reads-chart'
import { SkillFrequencyChart } from '@/components/dashboard/skill-frequency-chart'
import { ModelShareChart } from '@/components/dashboard/model-share-chart'
import { TopUsersList } from '@/components/dashboard/top-users-list'
import { RecentSessionsList } from '@/components/dashboard/recent-sessions-list'
import { useDashboardOverview } from '@/hooks/use-dashboard-overview'
import { useDashboardUsers } from '@/hooks/use-dashboard-users'
import { useDashboardSessions } from '@/hooks/use-dashboard-sessions'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function periodLabel(from: Date, to: Date): string {
  const today = new Date()
  const todayKey = format(today, 'yyyy-MM-dd')
  const toKey = format(to, 'yyyy-MM-dd')
  if (toKey === todayKey) {
    const days = differenceInDays(to, from) + 1
    if (days >= 365 * 5) return 'all time'
    return `last ${days} days`
  }
  return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`
}

function OverviewContent({
  orgSlug,
  projectId,
}: {
  orgSlug: string
  projectId: string | undefined
}) {
  const searchParams = useSearchParams()
  const today = new Date()
  const sevenDaysAgo = format(subDays(today, 7), 'yyyy-MM-dd')
  const todayStr = format(today, 'yyyy-MM-dd')

  const from = searchParams.get('from') || sevenDaysAgo
  const to = searchParams.get('to') || todayStr

  const fromDate = new Date(from)
  const toDate = new Date(to)

  const { data: overview, isLoading: overviewLoading, error: overviewError, refetch: refetchOverview } =
    useDashboardOverview(orgSlug, { projectId, from, to })
  const summary = overview?.summary
  const usage = overview?.usage

  // Top 5 users by tokens, always last 7 days (independent of the main date range)
  const { data: topUsersData, isLoading: usersLoading } =
    useDashboardUsers(orgSlug, {
      projectId,
      from: sevenDaysAgo,
      to: todayStr,
      page: 1,
      pageSize: 10,
      sort: 'tokens',
    })

  // 5 most recent sessions — scoped to selected date range
  const { data: recentSessionsData, isLoading: sessionsLoading } =
    useDashboardSessions(orgSlug, {
      projectId,
      from,
      to,
      page: 1,
      pageSize: 10,
    })

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  if (overviewError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchOverview()
              }}
            >
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const hasNoData =
    !summary || (summary.sessionCount === 0 && summary.activeUserCount === 0)

  if (hasNoData) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Overview</h1>
          <DateRangePicker />
        </div>
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-12 text-center">
          <h2 className="text-lg font-medium mb-2">
            아직 수집된 데이터가 없습니다
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            팀원들이 argos를 설정하고 Claude Code를 사용하면 여기에 데이터가 표시됩니다.
          </p>
        </div>
      </div>
    )
  }

  const series = usage?.series ?? []
  const topSkills = summary?.topSkills ?? []
  const modelShare = summary?.modelShare ?? []
  const topUsers = (topUsersData?.items ?? []).slice(0, 5)
  const recentSessions = (recentSessionsData?.items ?? []).slice(0, 5)

  return (
    <div className="space-y-6">
      <OverviewStats
        periodLabel={periodLabel(fromDate, toDate)}
        sessions={summary?.sessionCount ?? 0}
        turns={summary?.turnCount ?? 0}
        inputTokens={summary?.totalInputTokens ?? 0}
        outputTokens={summary?.totalOutputTokens ?? 0}
        cacheReadTokens={summary?.totalCacheReadTokens ?? 0}
        cacheCreationTokens={summary?.totalCacheCreationTokens ?? 0}
        estimatedCostUsd={summary?.estimatedCostUsd ?? 0}
        rangeSelector={<DateRangePicker />}
      />

      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard
          title="Your daily work"
          description="Tokens you paid for: input, output, 그리고 재사용을 위해 저장된 cache create."
        >
          <DailyWorkChart data={series} />
        </ChartCard>

        <ChartCard
          title="Daily cache reads"
          description="Cache reads는 Claude가 이미 본 것(CLAUDE.md 등)을 재사용하는 저렴한 토큰입니다. 일반 input 대비 약 ~10× 저렴하므로 높은 값이 좋은 신호입니다."
        >
          <DailyCacheReadsChart data={series} />
        </ChartCard>

        <ChartCard
          title="Skill별 호출 빈도"
          description="가장 많이 호출된 스킬 Top 10"
        >
          <SkillFrequencyChart data={topSkills} />
        </ChartCard>

        <ChartCard
          title="Token usage by model"
          description="Claude 모델별 billable 토큰 점유율."
        >
          <ModelShareChart data={modelShare} />
        </ChartCard>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard
          title="Top users"
          description="최근 7일간 토큰 소모량 기준 Top 5"
        >
          {usersLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <TopUsersList users={topUsers} />
          )}
        </ChartCard>

        <ChartCard
          title="Recent sessions"
          description="최근 발생한 세션 5개"
        >
          {sessionsLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <RecentSessionsList sessions={recentSessions} orgSlug={orgSlug} />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function OrgOverviewPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug as string
  const projectId = searchParams.get('projectId') ?? undefined

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <OverviewContent orgSlug={orgSlug} projectId={projectId} />
    </Suspense>
  )
}
