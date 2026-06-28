'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, TooltipProps } from 'recharts'
import { formatTokens } from '@/lib/format'
import type { ModelShare } from '@argos/shared'

interface ModelShareChartProps {
  data: ModelShare[]
}

const CHART_VARS = [
  'var(--color-chart-2)',
  'var(--color-chart-1)',
  'var(--color-chart-5)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
]

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]?.payload as { model: string; totalTokens: number; pct: number } | undefined
  if (!p) return null
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 text-sm">
      <p className="font-medium mb-1 break-all max-w-[240px]">{p.model}</p>
      <div className="text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">{formatTokens(p.totalTokens)}</span>
        <span className="ml-2 tabular-nums">({p.pct.toFixed(1)}%)</span>
      </div>
    </div>
  )
}

export function ModelShareChart({ data }: ModelShareChartProps) {
  // Memoize data transformation and sum calculation to prevent expensive
  // array recalculations and unnecessary Recharts re-renders on every update
  // Impact: O(n) compute time saved per render, consistent array reference for chart
  const { total, chartData } = useMemo(() => {
    const sum = data.reduce((s, d) => s + d.totalTokens, 0)
    return {
      total: sum,
      chartData: data.map((d) => ({
        ...d,
        pct: sum > 0 ? (d.totalTokens / sum) * 100 : 0,
      })),
    }
  }, [data])

  if (total === 0 || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
        No model usage yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="totalTokens"
          nameKey="model"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          stroke="var(--color-card)"
          strokeWidth={2}
          label={(entry: { pct?: number }) =>
            entry.pct !== undefined && entry.pct >= 8 ? `${entry.pct.toFixed(0)}%` : ''
          }
          labelLine={false}
        >
          {chartData.map((_, i) => (
            <Cell key={`c-${i}`} fill={CHART_VARS[i % CHART_VARS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          iconType="square"
          wrapperStyle={{ fontSize: '11px' }}
          formatter={(value: string) => {
            const truncated = value.length > 30 ? value.slice(0, 30) + '…' : value
            return <span className="text-muted-foreground">{truncated}</span>
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
