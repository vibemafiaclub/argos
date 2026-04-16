'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { StatCard } from '@/components/dashboard/stat-card'
import { MessageBubble } from '@/components/dashboard/message-bubble'
import { SessionTimelineChart } from '@/components/dashboard/session-timeline-chart'
import { useSessionDetail } from '@/hooks/use-dashboard-sessions'
import { formatTokens, formatCost, formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>
}) {
  const { projectId, sessionId } = use(params)
  const router = useRouter()

  const { data, isLoading, error, refetch } = useSessionDetail(projectId, sessionId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-3/4" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Session Detail</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          ← Back to Sessions
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Session Not Found</h1>
        <Button variant="outline" onClick={() => router.back()}>
          ← Back to Sessions
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Session Detail</h1>
        <Button variant="outline" onClick={() => router.back()}>
          ← Back to Sessions
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="User" value={data.userName} />
        <StatCard
          title="Input Tokens"
          value={formatTokens(data.inputTokens)}
        />
        <StatCard
          title="Output Tokens"
          value={formatTokens(data.outputTokens)}
        />
        <StatCard title="Cost" value={formatCost(data.estimatedCostUsd)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Started" value={formatDate(data.startedAt)} />
        <StatCard
          title="Ended"
          value={data.endedAt ? formatDate(data.endedAt) : 'In Progress'}
        />
        <StatCard title="Events" value={data.eventCount} />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Session Timeline</h2>
        <SessionTimelineChart
          usageTimeline={data.usageTimeline}
          toolEvents={data.toolEvents}
          sessionStartedAt={data.startedAt}
        />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Conversation</h2>
        <div className="space-y-4">
          {data.messages.map((message, idx) => (
            <MessageBubble
              key={idx}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
            />
          ))}
          {data.messages.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              No messages recorded for this session
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
