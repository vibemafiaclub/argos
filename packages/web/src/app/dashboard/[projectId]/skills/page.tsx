'use client'

import { use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { subDays, format } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { SkillBarChart } from '@/components/dashboard/skill-bar-chart'
import { useDashboardSkills } from '@/hooks/use-dashboard-skills'
import { formatDate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function SkillsContent({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams()
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  const from = searchParams.get('from') || format(thirtyDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const { data, isLoading, error, refetch } = useDashboardSkills(projectId, from, to)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-96" />
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-80" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Skeleton className="h-12 w-full" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Skills</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data?.skills || data.skills.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Skills</h1>
          <DateRangePicker />
        </div>

        <div className="bg-white p-12 rounded-lg shadow text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            아직 Skill 호출이 없습니다
          </h2>
          <p className="text-gray-600">
            Claude Code에서 /skill-name을 실행하면 여기에 표시됩니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Skills</h1>
        <DateRangePicker />
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Top 10 Skills</h2>
        <SkillBarChart data={data.skills} />
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left py-3 px-4 font-medium whitespace-nowrap">Skill Name</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Total Calls</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Slash Commands</th>
              <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {data.skills.map((skill) => (
              <tr key={skill.skillName} className="border-b hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 font-mono text-sm">{skill.skillName}</td>
                <td className="text-right py-3 px-4">{skill.callCount}</td>
                <td className="text-right py-3 px-4">{skill.slashCommandCount}</td>
                <td className="text-right py-3 px-4">{formatDate(skill.lastUsedAt)}</td>
              </tr>
            ))}
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
