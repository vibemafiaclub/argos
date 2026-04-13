'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { useDashboardAgents } from '@/hooks/use-dashboard-agents'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function AgentsContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading, error, refetch } = useDashboardAgents(projectId, from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Agents</h1>
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
        <h1 className="text-2xl font-bold">Agents</h1>
        <DateRangePicker />
      </div>

      {(!data?.agents || data.agents.length === 0) && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            아직 Agent 호출이 없습니다
          </h2>
          <p className="text-gray-600">
            Claude Code에서 Agent를 사용하면 여기에 표시됩니다.
          </p>
        </div>
      )}

      {data?.agents && data.agents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.agents.map((agent) => (
            <Card key={agent.agentType} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">{agent.agentType}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Call Count:</span>
                    <span className="font-semibold">{agent.callCount}</span>
                  </div>
                  {agent.sampleDesc && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-gray-500">Sample Description:</p>
                      <p className="text-sm mt-1 line-clamp-2" title={agent.sampleDesc}>
                        {agent.sampleDesc}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <AgentsContent projectId={projectId} />
    </Suspense>
  )
}
