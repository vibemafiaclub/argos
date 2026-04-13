'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipProps, Cell } from 'recharts'
import type { SkillStat } from '@argos/shared'

interface SkillBarChartProps {
  data: SkillStat[]
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null

  const skillName = payload[0]?.payload?.skill
  const calls = payload[0]?.value ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
      <p className="font-medium text-gray-900 mb-1" title={skillName}>
        {skillName}
      </p>
      <div className="text-sm">
        <span className="text-gray-600">Calls:</span>
        <span className="font-medium ml-2">{calls.toLocaleString()}</span>
      </div>
    </div>
  )
}

function truncateSkillName(name: string, maxLength = 15) {
  if (name.length <= maxLength) return name
  return name.slice(0, maxLength) + '...'
}

export function SkillBarChart({ data }: SkillBarChartProps) {
  const chartData = data.slice(0, 10).map(s => ({
    skill: s.skillName,
    displaySkill: truncateSkillName(s.skillName),
    calls: s.callCount,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <YAxis
          dataKey="displaySkill"
          type="category"
          width={120}
          stroke="#6b7280"
          style={{ fontSize: '12px' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="calls" name="Calls" radius={[0, 4, 4, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
