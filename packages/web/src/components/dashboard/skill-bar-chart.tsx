'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { SkillStat } from '@argos/shared'

interface SkillBarChartProps {
  data: SkillStat[]
}

export function SkillBarChart({ data }: SkillBarChartProps) {
  const chartData = data.slice(0, 10).map(s => ({
    skill: s.skillName,
    calls: s.callCount,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="skill" type="category" width={120} />
        <Tooltip />
        <Bar dataKey="calls" fill="#10b981" name="Calls" />
      </BarChart>
    </ResponsiveContainer>
  )
}
