'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useDashboardUsers } from '@/hooks/use-dashboard-users'
import { formatTokens, formatCost } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

function UsersContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading } = useDashboardUsers(projectId, from, to)

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Users</h1>
        <DateRangePicker />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-medium">User</th>
              <th className="text-right py-3 px-4 font-medium">Sessions</th>
              <th className="text-right py-3 px-4 font-medium">Input Tokens</th>
              <th className="text-right py-3 px-4 font-medium">Output Tokens</th>
              <th className="text-right py-3 px-4 font-medium">Cost</th>
              <th className="text-right py-3 px-4 font-medium">Skills</th>
              <th className="text-right py-3 px-4 font-medium">Agents</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.userId} className="border-b hover:bg-gray-50">
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
