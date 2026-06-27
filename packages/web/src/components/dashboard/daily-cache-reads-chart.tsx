'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, TooltipProps } from 'recharts'
import { formatTokens } from '@/lib/format'
import type { UsageSeries } from '@argos/shared'

interface DailyCacheReadsChartProps {
  data: UsageSeries[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const value = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      <p className="font-medium mb-2">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-sm bg-chart-3" />
        <span className="text-muted-foreground">cache read:</span>
        <span className="font-medium tabular-nums">{formatTokens(value)}</span>
      </div>
    </div>
  )
}

export function DailyCacheReadsChart({ data }: DailyCacheReadsChartProps) {
  // Optimization: Memoize the Recharts data array to prevent expensive unnecessary re-renders.
  // Impact: Reduces re-renders and improves responsiveness of the dashboard by avoiding mapping over usage data repeatedly.
  const chartData = useMemo(() => {
    return data.map(d => ({
      date: d.date,
      cacheRead: d.cacheReadTokens,
    }))
  }, [data])

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          angle={-40}
          textAnchor="end"
          height={50}
          style={{ fontSize: '10px' }}
        />
        <YAxis
          tickFormatter={(v: number) => v.toLocaleString()}
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '10px' }}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} />
        <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }} iconType="square" />
        <Bar dataKey="cacheRead" name="cache read" fill="var(--color-chart-3)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
