'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, TooltipProps } from 'recharts'

interface SkillFrequencyChartProps {
  data: Array<{ skillName: string; callCount: number }>
}

const CHART_VARS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

function truncate(name: string, max = 16) {
  if (name.length <= max) return name
  return name.slice(0, max) + '…'
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const skill = payload[0]?.payload?.skill
  const calls = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      <p className="font-medium mb-1" title={skill}>{skill}</p>
      <div className="text-sm">
        <span className="text-muted-foreground">calls:</span>
        <span className="font-medium ml-2 tabular-nums">{calls.toLocaleString()}</span>
      </div>
    </div>
  )
}

export function SkillFrequencyChart({ data }: SkillFrequencyChartProps) {
  // Optimization: Memoize the Recharts data array to prevent expensive unnecessary re-renders.
  // Impact: Reduces re-renders and improves responsiveness of the dashboard by avoiding slicing and mapping over usage data repeatedly.
  const chartData = useMemo(() => {
    return data.slice(0, 10).map(s => ({
      skill: s.skillName,
      displaySkill: truncate(s.skillName),
      calls: s.callCount,
    }))
  }, [data])

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
        No skill data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="displaySkill"
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          angle={-30}
          textAnchor="end"
          height={70}
          interval={0}
          style={{ fontSize: '11px' }}
        />
        <YAxis
          tickFormatter={(v: number) => v.toLocaleString()}
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '10px' }}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }} />
        <Bar dataKey="calls" name="calls" radius={[4, 4, 0, 0]}>
          {chartData.map((_, i) => (
            <Cell key={`c-${i}`} fill={CHART_VARS[i % CHART_VARS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
