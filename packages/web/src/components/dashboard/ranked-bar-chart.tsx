'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { TooltipProps } from 'recharts'

export interface RankedBarItem {
  label: string
  value: number
}

interface RankedBarChartProps {
  data: RankedBarItem[]
  /** 툴팁 내 value 라벨 (예: "Invocations") */
  valueLabel?: string
  /** 상위 N개만 표시. 기본 10. */
  limit?: number
}

function truncateLabel(name: string, maxLength = 18) {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength) + '…'
}

interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {
  valueLabel: string
}

function ChartTooltip({ active, payload, valueLabel }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const fullLabel = payload[0]?.payload?.label as string | undefined
  const rawValue = payload[0]?.value ?? 0
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue) || 0

  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      <p className="font-medium mb-1" title={fullLabel}>{fullLabel}</p>
      <div className="text-sm">
        <span className="text-muted-foreground">{valueLabel}:</span>
        <span className="font-medium ml-2 tabular-nums">{value.toLocaleString()}</span>
      </div>
    </div>
  )
}

export function RankedBarChart({ data, valueLabel = 'Invocations', limit = 10 }: RankedBarChartProps) {
  // Optimization: Memoize the Recharts data array to prevent expensive unnecessary re-renders.
  // Impact: Reduces re-renders and improves responsiveness of the dashboard by avoiding slicing and mapping over usage data repeatedly.
  const chartData = useMemo(() => {
    return data.slice(0, limit).map(d => ({
      label: d.label,
      displayLabel: truncateLabel(d.label),
      value: d.value,
    }))
  }, [data, limit])

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="displayLabel"
          type="category"
          interval={0}
          angle={-30}
          textAnchor="end"
          height={70}
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '11px' }}
        />
        <YAxis
          type="number"
          allowDecimals={false}
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '11px' }}
        />
        <Tooltip
          content={(props) => <ChartTooltip {...props} valueLabel={valueLabel} />}
          cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
        />
        <Bar dataKey="value" name={valueLabel} radius={[4, 4, 0, 0]} fill="var(--color-chart-1)" />
      </BarChart>
    </ResponsiveContainer>
  )
}
