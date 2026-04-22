'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipProps,
} from 'recharts'
import { parseISO } from 'date-fns'
import { formatTokens } from '@/lib/format'
import type { DailySeriesPoint } from '@/types/reports'

interface WeeklyFlowChartProps {
  thisWeek: DailySeriesPoint[]
  prevWeek: DailySeriesPoint[]
}

interface ChartRow {
  day: string  // "Mon" / "Tue" ...
  thisWeekTokens: number
  prevWeekTokens: number
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  const thisWeek = payload.find((p) => p.dataKey === 'thisWeekTokens')?.value ?? 0
  const prevWeek = payload.find((p) => p.dataKey === 'prevWeekTokens')?.value ?? 0
  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3">
      <p className="font-medium mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        <Row color="var(--color-chart-1)" label="이번 주" value={Number(thisWeek)} />
        <Row color="var(--color-chart-2)" label="지난 주" value={Number(prevWeek)} />
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

function sumTokens(p: DailySeriesPoint): number {
  return p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreationTokens
}

export function WeeklyFlowChart({ thisWeek, prevWeek }: WeeklyFlowChartProps) {
  // 요일 기준으로 병합 (월~일 7개 슬롯)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const data: ChartRow[] = dayNames.map((day) => ({ day, thisWeekTokens: 0, prevWeekTokens: 0 }))

  for (const p of thisWeek) {
    const idx = dayIndex(p.date)
    if (idx >= 0) data[idx].thisWeekTokens += sumTokens(p)
  }
  for (const p of prevWeek) {
    const idx = dayIndex(p.date)
    if (idx >= 0) data[idx].prevWeekTokens += sumTokens(p)
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="day"
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '11px' }}
        />
        <YAxis
          tickFormatter={(v: number) => formatTokens(v)}
          stroke="var(--color-muted-foreground)"
          tickLine={false}
          axisLine={false}
          style={{ fontSize: '10px' }}
          width={60}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'var(--color-muted)', opacity: 0.3 }}
        />
        <Legend wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }} iconType="square" />
        <Bar
          dataKey="thisWeekTokens"
          name="이번 주"
          fill="var(--color-chart-1)"
          radius={[2, 2, 0, 0]}
        />
        <Line
          dataKey="prevWeekTokens"
          name="지난 주"
          type="monotone"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-chart-2)' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** YYYY-MM-DD → 0(Mon) ~ 6(Sun). 파싱 실패 -1 */
function dayIndex(isoDate: string): number {
  try {
    const d = parseISO(isoDate)
    const jsDay = d.getUTCDay()  // 0=Sun ... 6=Sat
    return (jsDay + 6) % 7         // 0=Mon ... 6=Sun
  } catch {
    return -1
  }
}

