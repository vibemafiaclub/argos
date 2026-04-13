'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useDashboardUsers } from '@/hooks/use-dashboard-users'
import { formatTokens, formatCost } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function UsersContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading, error, refetch } = useDashboardUsers(projectId, from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="space-y-0">
            <Skeleton className="h-12 w-full" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <DateRangePicker />
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-medium whitespace-nowrap">User</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Sessions</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Input Tokens</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Output Tokens</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Cost</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Skills</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Agents</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.userId} className="border-b hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4">{user.name}</td>
                <td className="text-right py-3 px-4">{user.sessionCount}</td>
                <td className="text-right py-3 px-4">{formatTokens(user.inputTokens)}</td>
                <td className="text-right py-3 px-4">{formatTokens(user.outputTokens)}</td>
                <td className="text-right py-3 px-4">{formatCost(user.estimatedCostUsd)}</td>
                <td className="text-right py-3 px-4">{user.skillCalls}</td>
                <td className="text-right py-3 px-4">{user.agentCalls}</td>
              </tr>
            ))}
            {(!data?.users || data.users.length === 0) && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No user data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function UsersPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <UsersContent projectId={projectId} />
    </Suspense>
  )
}
