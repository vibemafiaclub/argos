'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, TooltipProps } from 'recharts'
import { formatTokens } from '@/lib/format'
import type { UsageSeries } from '@argos/shared'

interface DailyWorkChartProps {
  data: UsageSeries[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const input = payload.find(p => p.dataKey === 'input')?.value ?? 0
  const output = payload.find(p => p.dataKey === 'output')?.value ?? 0
  const cacheCreate = payload.find(p => p.dataKey === 'cacheCreate')?.value ?? 0

  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      <p className="font-medium mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <Row color="var(--color-chart-2)" label="input" value={Number(input)} />
        <Row color="var(--color-chart-5)" label="output" value={Number(output)} />
        <Row color="var(--color-chart-4)" label="cache create" value={Number(cacheCreate)} />
      </div>
    </div>
  )
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular-nums">{formatTokens(value)}</span>
    </div>
  )
}

export function DailyWorkChart({ data }: DailyWorkChartProps) {
  // Memoize chart data to prevent unnecessary re-renders in Recharts
  // Impact: Prevents Recharts from seeing a new array reference on every render,
  // reducing re-renders when parent state updates.
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      input: d.inputTokens,
      output: d.outputTokens,
      cacheCreate: d.cacheCreationTokens,
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
          width={70}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} />
        <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }} iconType="square" />
        <Bar dataKey="input" name="input" stackId="work" fill="var(--color-chart-2)" />
        <Bar dataKey="output" name="output" stackId="work" fill="var(--color-chart-5)" />
        <Bar dataKey="cacheCreate" name="cache create" stackId="work" fill="var(--color-chart-4)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
