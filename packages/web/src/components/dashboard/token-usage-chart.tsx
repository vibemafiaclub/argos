'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatTokens, formatDate } from '@/lib/format'
import type { UsageSeries } from '@argos/shared'

interface TokenUsageChartProps {
  data: UsageSeries[]
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
  const chartData = data.map(d => ({
    date: formatDate(d.date),
    input: d.inputTokens,
    output: d.outputTokens,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis tickFormatter={formatTokens} />
        <Tooltip
          formatter={(value: number) => formatTokens(value)}
          labelStyle={{ color: '#000' }}
        />
        <Area
          type="monotone"
          dataKey="input"
          stackId="1"
          stroke="#8b5cf6"
          fill="#8b5cf6"
          name="Input Tokens"
        />
        <Area
          type="monotone"
          dataKey="output"
          stackId="1"
          stroke="#3b82f6"
          fill="#3b82f6"
          name="Output Tokens"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
