'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts'
import { formatTokens, formatCost } from '@/lib/format'
import type { UsageSeries } from '@argos/shared'
import { format } from 'date-fns'

interface TokenUsageChartProps {
  data: UsageSeries[]
}

const COST_PER_INPUT_TOKEN = 0.000003 // $3 per million
const COST_PER_OUTPUT_TOKEN = 0.000015 // $15 per million

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null

  const inputTokens = payload[0]?.value ?? 0
  const outputTokens = payload[1]?.value ?? 0
  const estimatedCost = (inputTokens * COST_PER_INPUT_TOKEN) + (outputTokens * COST_PER_OUTPUT_TOKEN)

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-violet-500"></div>
          <span className="text-gray-600">Input:</span>
          <span className="font-medium">{formatTokens(inputTokens)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span className="text-gray-600">Output:</span>
          <span className="font-medium">{formatTokens(outputTokens)}</span>
        </div>
        <div className="pt-1 mt-1 border-t border-gray-200">
          <span className="text-gray-600">Cost:</span>
          <span className="font-medium ml-2">{formatCost(estimatedCost)}</span>
        </div>
      </div>
    </div>
  )
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  const chartData = data.map(d => {
    const date = new Date(d.date)
    return {
      date: format(date, 'MMM d'),
      fullDate: format(date, 'MMM d, yyyy'),
      input: d.inputTokens,
      output: d.outputTokens,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          tickFormatter={formatTokens}
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="input"
          stackId="1"
          stroke="#8b5cf6"
          fill="#8b5cf6"
          fillOpacity={0.6}
          name="Input Tokens"
        />
        <Area
          type="monotone"
          dataKey="output"
          stackId="1"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.6}
          name="Output Tokens"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
