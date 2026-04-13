'use client'

import { use, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useDashboardSessions } from '@/hooks/use-dashboard-sessions'
import { formatTokens, formatCost, formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

function SessionsContent({ projectId }: { projectId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading } = useDashboardSessions(projectId, from, to)

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  const handleRowClick = (sessionId: string) => {
    router.push(`/dashboard/${projectId}/sessions/${sessionId}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <DateRangePicker />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-medium">User</th>
              <th className="text-left py-3 px-4 font-medium">Started</th>
              <th className="text-left py-3 px-4 font-medium">Ended</th>
              <th className="text-right py-3 px-4 font-medium">Input</th>
              <th className="text-right py-3 px-4 font-medium">Output</th>
              <th className="text-right py-3 px-4 font-medium">Cost</th>
              <th className="text-right py-3 px-4 font-medium">Events</th>
            </tr>
          </thead>
          <tbody>
            {data?.sessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => handleRowClick(session.id)}
                className="border-b hover:bg-gray-50 cursor-pointer"
              >
                <td className="py-3 px-4">{session.userName}</td>
                <td className="py-3 px-4">{formatDate(session.startedAt)}</td>
                <td className="py-3 px-4">
                  {session.endedAt ? formatDate(session.endedAt) : '—'}
                </td>
                <td className="text-right py-3 px-4">{formatTokens(session.inputTokens)}</td>
                <td className="text-right py-3 px-4">{formatTokens(session.outputTokens)}</td>
                <td className="text-right py-3 px-4">{formatCost(session.estimatedCostUsd)}</td>
                <td className="text-right py-3 px-4">{session.eventCount}</td>
              </tr>
            ))}
            {(!data?.sessions || data.sessions.length === 0) && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No session data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SessionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <SessionsContent projectId={projectId} />
    </Suspense>
  )
}
