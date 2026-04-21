'use client'

import { use, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EventList } from '@/components/dashboard/event-list'
import { EventDetail } from '@/components/dashboard/event-detail'
import { SessionTimelineChart } from '@/components/dashboard/session-timeline-chart'
import { SessionActivityRibbon } from '@/components/dashboard/session-activity-ribbon'
import { useSessionDetail } from '@/hooks/use-dashboard-sessions'
import { messagesToTimeline } from '@/lib/timeline-events'
import {
  formatTokens,
  formatCost,
  formatDate,
  formatDuration,
  formatRelativeTime,
} from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>
}) {
  const { projectId, sessionId } = use(params)
  const router = useRouter()

  const { data, isLoading, error, refetch } = useSessionDetail(projectId, sessionId)

  const events = useMemo(
    () => (data ? messagesToTimeline(data.messages) : []),
    [data],
  )
  const [selectedIdx, setSelectedIdx] = useState<number | null>(0)
  const safeIdx =
    selectedIdx === null
      ? null
      : Math.min(selectedIdx, Math.max(0, events.length - 1))
  const selectedEvent = safeIdx !== null ? events[safeIdx] ?? null : null
  const [tab, setTab] = useState<'transcript' | 'debug'>('transcript')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-48 w-full" />
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
        <Button variant="outline" onClick={() => router.back()}>
          ← Back to Sessions
        </Button>
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

  if (!data) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()}>
          ← Back to Sessions
        </Button>
        <p className="text-sm text-gray-500">Session not found.</p>
      </div>
    )
  }

  const truncatedId =
    data.id.length > 12 ? `${data.id.slice(0, 12)}…` : data.id
  const duration = formatDuration(data.startedAt, data.endedAt)
  const relative = formatRelativeTime(data.startedAt)

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="px-2"
          >
            ←
          </Button>
          <h1 className="text-lg font-semibold">Session {truncatedId}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          <span>{duration}</span>
          {!data.endedAt && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                Live
              </span>
            </>
          )}
          <span>·</span>
          <span>{relative}</span>
          <span>·</span>
          <span>{data.eventCount} events</span>
        </div>
      </header>

      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500">
        <span>{data.userName}</span>
        <span>·</span>
        <span>In {formatTokens(data.inputTokens)}</span>
        <span>·</span>
        <span>Out {formatTokens(data.outputTokens)}</span>
        <span>·</span>
        <span>{formatCost(data.estimatedCostUsd)}</span>
        <span>·</span>
        <span>Started {formatDate(data.startedAt)}</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <Tabs value={tab} onChange={(v) => setTab(v as 'transcript' | 'debug')}>
          <TabsList className="px-4">
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
          </TabsList>
          <TabsContent value="transcript">
            <div className="px-4 pt-3 pb-2">
              <SessionActivityRibbon
                events={events}
                selectedIdx={safeIdx}
                onSelect={setSelectedIdx}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(320px,2fr)_3fr] min-h-[500px]">
              <div className="border-r border-gray-200 overflow-y-auto max-h-[calc(100vh-360px)]">
                <EventList
                  events={events}
                  selectedIdx={safeIdx ?? -1}
                  onSelect={setSelectedIdx}
                  sessionStartedAt={data.startedAt}
                />
              </div>
              <div className="overflow-hidden max-h-[calc(100vh-360px)]">
                <EventDetail
                  event={selectedEvent}
                  onClose={() => setSelectedIdx(null)}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="debug">
            <div className="max-h-[calc(100vh-360px)] overflow-auto p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Session Timeline</h3>
                <SessionTimelineChart
                  usageTimeline={data.usageTimeline}
                  messages={data.messages}
                  sessionStartedAt={data.startedAt}
                />
              </div>
              <pre className="text-xs bg-gray-50 rounded p-4 overflow-auto whitespace-pre">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
