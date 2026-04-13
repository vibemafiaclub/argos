'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { StatCard } from '@/components/dashboard/stat-card'
import { useSessionDetail } from '@/hooks/use-dashboard-sessions'
import { formatTokens, formatCost, formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>
}) {
  const { projectId, sessionId } = use(params)
  const router = useRouter()

  const { data, isLoading } = useSessionDetail(projectId, sessionId)

  if (isLoading) {
    return <Skeleton className="h-screen w-full" />
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Session Not Found</h1>
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:underline"
        >
          ← Back to Sessions
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Session Detail</h1>
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:underline"
        >
          ← Back to Sessions
        </button>
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
        <h2 className="text-lg font-semibold mb-4">Conversation</h2>
        <div className="space-y-4">
          {data.messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${
                message.role === 'HUMAN' ? 'justify-start' : 'justify-end'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === 'HUMAN'
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <div className="text-xs opacity-75 mb-1">
                  {message.role === 'HUMAN' ? 'User' : 'Assistant'} •{' '}
                  {formatDate(message.timestamp)}
                </div>
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              </div>
            </div>
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
