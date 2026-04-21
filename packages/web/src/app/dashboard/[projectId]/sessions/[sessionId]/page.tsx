'use client'

import { use, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EventList } from '@/components/dashboard/event-list'
import { EventDetail } from '@/components/dashboard/event-detail'
import { SessionTimelineChart } from '@/components/dashboard/session-timeline-chart'
import { SessionActivityRibbon } from '@/components/dashboard/session-activity-ribbon'
import {
  SessionFilesSummary,
  SessionFilesTab,
} from '@/components/dashboard/session-files'
import { useSessionDetail } from '@/hooks/use-dashboard-sessions'
import { messagesToTimeline } from '@/lib/timeline-events'
import { extractSessionFiles } from '@/lib/session-files'
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
  const files = useMemo(() => extractSessionFiles(events), [events])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(0)
  const safeIdx =
    selectedIdx === null
      ? null
      : Math.min(selectedIdx, Math.max(0, events.length - 1))
  const selectedEvent = safeIdx !== null ? events[safeIdx] ?? null : null
  const [tab, setTab] = useState<'transcript' | 'files' | 'debug'>('transcript')

  const jumpToEvent = (idx: number) => {
    setSelectedIdx(idx)
    setTab('transcript')
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
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
        <p className="text-sm text-muted-foreground">Session not found.</p>
      </div>
    )
  }

  const truncatedId =
    data.id.length > 12 ? `${data.id.slice(0, 12)}…` : data.id
  const duration = formatDuration(data.startedAt, data.endedAt)
  const relative = formatRelativeTime(data.startedAt)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="px-2 shrink-0"
            >
              ←
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">
                {data.title ?? <span className="text-muted-foreground">Session {truncatedId}</span>}
              </h1>
              {data.title && (
                <p className="text-xs text-muted-foreground font-mono">Session {truncatedId}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground shrink-0">
            <span>{duration}</span>
            {!data.endedAt && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-success">
                  Live
                </span>
              </>
            )}
            <span>·</span>
            <span>{relative}</span>
            <span>·</span>
            <span>{data.eventCount} events</span>
          </div>
        </div>
        {data.summary && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
        )}
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
        <SessionFilesSummary
          files={files}
          onOpenFilesTab={() => setTab('files')}
        />
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as 'transcript' | 'files' | 'debug')}
        >
          <TabsList className="px-4">
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
          </TabsList>
          <TabsContent value="transcript">
            <div className="px-4 pt-3 pb-2">
              <SessionActivityRibbon
                events={events}
                selectedIdx={safeIdx}
                onSelect={setSelectedIdx}
                sessionStartedAt={data.startedAt}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(320px,2fr)_3fr] h-[calc(100vh-360px)] min-h-[500px]">
              <div className="border-r border-border">
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
          <TabsContent value="files">
            <div className="max-h-[calc(100vh-360px)] overflow-auto">
              <SessionFilesTab files={files} onJump={jumpToEvent} />
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
              <pre className="text-xs bg-muted/40 text-muted-foreground rounded-md p-4 overflow-auto whitespace-pre">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
