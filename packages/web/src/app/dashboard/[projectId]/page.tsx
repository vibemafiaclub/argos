'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { StatCard } from '@/components/dashboard/stat-card'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { TokenUsageChart } from '@/components/dashboard/token-usage-chart'
import { useDashboardSummary } from '@/hooks/use-dashboard-summary'
import { useDashboardUsage } from '@/hooks/use-dashboard-usage'
import { formatTokens, formatCost } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function OverviewContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data: summary, isLoading: summaryLoading, error: summaryError, refetch: refetchSummary } = useDashboardSummary(projectId, from, to)
  const { data: usage, isLoading: usageLoading, error: usageError, refetch: refetchUsage } = useDashboardUsage(projectId, from, to)

  if (summaryLoading || usageLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-80" />
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </div>
    )
  }

  if (summaryError || usageError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Overview</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchSummary()
                refetchUsage()
              }}
            >
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const hasNoData = !summary || (summary.sessionCount === 0 && summary.activeUserCount === 0)

  if (hasNoData) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Overview</h1>
          <DateRangePicker />
        </div>

        <div className="bg-white p-12 rounded-lg shadow text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            아직 수집된 데이터가 없습니다
          </h2>
          <p className="text-gray-600 mb-4">
            팀원들이 argos를 설정하고 Claude Code를 사용하면 여기에 데이터가 표시됩니다.
          </p>
          <a
            href="https://github.com/your-org/argos#setup"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-1"
          >
            설정 방법 보기 →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Overview</h1>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sessions"
          value={summary?.sessionCount ?? 0}
        />
        <StatCard
          title="Active Users"
          value={summary?.activeUserCount ?? 0}
        />
        <StatCard
          title="Total Tokens"
          value={formatTokens((summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0))}
        />
        <StatCard
          title="Estimated Cost"
          value={formatCost(summary?.estimatedCostUsd ?? 0)}
        />
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Token Usage Over Time</h2>
        <TokenUsageChart data={usage?.series ?? []} />
      </div>

      <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Top Skills</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Skill Name</th>
              <th className="text-right py-2">Call Count</th>
            </tr>
          </thead>
          <tbody>
            {summary?.topSkills.slice(0, 5).map((skill) => (
              <tr key={skill.skillName} className="border-b hover:bg-gray-50">
                <td className="py-2">{skill.skillName}</td>
                <td className="text-right py-2">{skill.callCount}</td>
              </tr>
            ))}
            {(!summary?.topSkills || summary.topSkills.length === 0) && (
              <tr>
                <td colSpan={2} className="py-4 text-center text-gray-500">
                  No skill data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <OverviewContent projectId={projectId} />
    </Suspense>
  )
}
