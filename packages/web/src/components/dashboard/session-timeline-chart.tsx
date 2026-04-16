'use client'

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts'
import { formatTokens, formatCost, formatRelativeTime } from '@/lib/format'
import type { SessionTimelineUsage, SessionTimelineTool } from '@argos/shared'

interface SessionTimelineChartProps {
  usageTimeline: SessionTimelineUsage[]
  toolEvents: SessionTimelineTool[]
  sessionStartedAt: string
}

interface ChartDataItem {
  relativeTime: string
  input: number
  output: number
  cost: number
  model?: string | null
  toolSummary: string
}

function getToolSummaryForIndex(
  index: number,
  usageTimeline: SessionTimelineUsage[],
  toolEvents: SessionTimelineTool[]
): string {
  // POST_TOOL_USE 이벤트만 필터링
  const postToolEvents = toolEvents.filter((e) => e.eventType === 'POST_TOOL_USE')

  if (postToolEvents.length === 0) return ''

  const currentTimestamp = new Date(usageTimeline[index]!.timestamp).getTime()
  const prevTimestamp =
    index > 0 ? new Date(usageTimeline[index - 1]!.timestamp).getTime() : 0

  // 현재 usageTimeline timestamp 이전이면서, 이전 usageTimeline timestamp 이후의 tool events 찾기
  // 첫 번째 bar(index=0)는 prevTimestamp가 0이므로 해당 bar 이전의 모든 이벤트를 포함
  const relevantTools = postToolEvents.filter((e) => {
    const toolTimestamp = new Date(e.timestamp).getTime()
    return toolTimestamp <= currentTimestamp && toolTimestamp > prevTimestamp
  })

  if (relevantTools.length === 0) return ''

  // 이름별로 카운트
  const counts = new Map<string, number>()
  for (const tool of relevantTools) {
    const name = tool.toolName || 'unknown'
    counts.set(name, (counts.get(name) || 0) + 1)
  }

  // 배열로 변환하여 카운트 내림차순 정렬
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])

  // 최대 3개까지만 표시
  const displayCount = Math.min(3, sorted.length)
  const displayItems = sorted.slice(0, displayCount).map(([name, count]) => {
    return count > 1 ? `${name} x${count}` : name
  })

  const remaining = sorted.length - displayCount
  if (remaining > 0) {
    return `${displayItems.join(', ')} +${remaining} more`
  }

  return displayItems.join(', ')
}

function CustomTooltip({
  active,
  payload,
}: TooltipProps<number, string> & { chartData?: ChartDataItem[] }) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload as ChartDataItem | undefined
  if (!data) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900 mb-2">{data.relativeTime}</p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-violet-500"></div>
          <span className="text-gray-600">Input Tokens:</span>
          <span className="font-medium">{formatTokens(data.input)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Output Tokens:</span>
          <span className="font-medium">{formatTokens(data.output)}</span>
        </div>
        <div className="pt-1 mt-1 border-t border-gray-200">
          <span className="text-gray-600">Cost:</span>
          <span className="font-medium ml-2">{formatCost(data.cost)}</span>
        </div>
        {data.model && (
          <div>
            <span className="text-gray-600">Model:</span>
            <span className="font-medium ml-2">{data.model}</span>
          </div>
        )}
        {data.toolSummary && (
          <div className="pt-1 mt-1 border-t border-gray-200">
            <span className="text-gray-600">Tools:</span>
            <span className="font-medium ml-2">{data.toolSummary}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function SessionTimelineChart({
  usageTimeline,
  toolEvents,
  sessionStartedAt,
}: SessionTimelineChartProps) {
  if (usageTimeline.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">No timeline data available</p>
    )
  }

  const chartData: ChartDataItem[] = usageTimeline.map((u, idx) => ({
    relativeTime: formatRelativeTime(u.timestamp, sessionStartedAt),
    input: u.inputTokens,
    output: u.outputTokens,
    cost: u.estimatedCostUsd,
    model: u.model,
    toolSummary: getToolSummaryForIndex(idx, usageTimeline, toolEvents),
  }))

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="relativeTime"
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
          tick={{ fill: '#6b7280' }}
        />
        <YAxis
          tickFormatter={formatTokens}
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="input"
          stackId="tokens"
          fill="#8b5cf6"
          name="Input Tokens"
        />
        <Bar
          dataKey="output"
          stackId="tokens"
          fill="#3b82f6"
          name="Output Tokens"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
