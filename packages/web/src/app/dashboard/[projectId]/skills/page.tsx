'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { SkillBarChart } from '@/components/dashboard/skill-bar-chart'
import { useDashboardSkills } from '@/hooks/use-dashboard-skills'
import { formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

function SkillsContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading } = useDashboardSkills(projectId, from, to)

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Skills</h1>
        <DateRangePicker />
      </div>

      {data?.skills && data.skills.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Top 10 Skills</h2>
          <SkillBarChart data={data.skills} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Skill Name</th>
              <th className="text-right py-3 px-4 font-medium">Total Calls</th>
              <th className="text-right py-3 px-4 font-medium">Slash Commands</th>
              <th className="text-right py-3 px-4 font-medium">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {data?.skills.map((skill) => (
              <tr key={skill.skillName} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono">{skill.skillName}</td>
                <td className="text-right py-3 px-4">{skill.callCount}</td>
                <td className="text-right py-3 px-4">{skill.slashCommandCount}</td>
                <td className="text-right py-3 px-4">{formatDate(skill.lastUsedAt)}</td>
              </tr>
            ))}
            {(!data?.skills || data.skills.length === 0) && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  No skill data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SkillsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <SkillsContent projectId={projectId} />
    </Suspense>
  )
}
