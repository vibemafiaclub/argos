'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { subDays, format, differenceInDays } from 'date-fns'
import { DateRangePicker } from '@/components/dashboard/date-range-picker'
import { RankedBarChart } from '@/components/dashboard/ranked-bar-chart'
import { ChartCard } from '@/components/dashboard/chart-card'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { SkillProjectsCell } from '@/components/dashboard/skill-projects-cell'
import { useDashboardSkills } from '@/hooks/use-dashboard-skills'
import { formatDateTimeFull, formatLastUsed, formatDurationMs } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { InfoTooltip } from '@/components/ui/info-tooltip'

function SkillsContent({
  orgSlug,
  projectId,
}: {
  orgSlug: string
  projectId: string | undefined
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const today = new Date()
  const sevenDaysAgo = subDays(today, 7)

  const from = searchParams.get('from') || format(sevenDaysAgo, 'yyyy-MM-dd')
  const to = searchParams.get('to') || format(today, 'yyyy-MM-dd')

  const isProjectFiltered = Boolean(projectId)

  const setProjectIdQuery = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('projectId', id)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const { data, isLoading, error, refetch } = useDashboardSkills(orgSlug, {
    projectId,
    from,
    to,
  })

  const rangeDays = differenceInDays(new Date(to), new Date(from)) + 1
  const rangeLabel = `last ${rangeDays} day${rangeDays === 1 ? '' : 's'}`

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="h-80" />
        </div>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
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
        <h1 className="text-2xl font-semibold">Skills</h1>
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

  const skills = data?.skills ?? []
  const totalInvocations = skills.reduce((sum, s) => sum + s.callCount, 0)

  if (skills.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold">Skills</h1>
            <span className="text-sm text-muted-foreground">{rangeLabel}</span>
          </div>
          <DateRangePicker />
        </div>

        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-12 text-center">
          <h2 className="text-lg font-medium mb-2">
            아직 Skill 호출이 없습니다
          </h2>
          <p className="text-sm text-muted-foreground">
            Claude Code에서 /skill-name을 실행하면 여기에 표시됩니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold">Skills</h1>
          <span className="text-sm text-muted-foreground">{rangeLabel}</span>
        </div>
        <DateRangePicker />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard label="Unique skills used" value={skills.length.toLocaleString()} />
        <KpiCard label="Total invocations" value={totalInvocations.toLocaleString()} />
      </div>

      <ChartCard title="Top skills (by invocations)">
        <RankedBarChart
          data={skills.map(s => ({ label: s.skillName, value: s.callCount }))}
          valueLabel="Invocations"
        />
      </ChartCard>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="px-4 py-4 border-b border-border">
          <h2 className="text-sm font-medium">All skills</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left py-3 px-4 font-medium whitespace-nowrap">Skill</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Invocations</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Sessions</th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Users
                    <InfoTooltip content="집계 기간 내 이 skill을 한 번이라도 호출한 distinct user_id 수. events의 Skill 호출과 transcript 메시지의 slash command 태그를 함께 집계합니다." />
                  </span>
                </th>
                <th className="text-left py-3 px-4 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Projects
                    {isProjectFiltered && (
                      <InfoTooltip content="Filtered to one project" />
                    )}
                  </span>
                </th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Median duration
                    <InfoTooltip content="이 skill의 tool 완료 시간 중앙값 — messages.duration_ms 의 p50. durationMs는 세션 종료(Stop) 시 transcript 기반으로 재빌드되므로 진행 중인 세션은 포함되지 않는다. 샘플 < 3건일 땐 —(대시) 표시." />
                  </span>
                </th>
                <th className="text-right py-3 px-4 font-medium whitespace-nowrap">Last used</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {skills.map((skill) => (
                <tr key={skill.skillName} className="border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors">
                  <td className="py-3 px-4">
                    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                      {skill.skillName}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4 tabular-nums">{skill.callCount.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 tabular-nums">{skill.sessionCount.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 tabular-nums">{skill.userCount.toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <SkillProjectsCell
                      projects={skill.projects}
                      additionalProjectCount={skill.additionalProjectCount}
                      isProjectFiltered={isProjectFiltered}
                      onSelectProject={setProjectIdQuery}
                    />
                  </td>
                  <td className="text-right py-3 px-4 tabular-nums">
                    {skill.medianDurationMs != null ? formatDurationMs(skill.medianDurationMs) : '—'}
                  </td>
                  <td
                    className="text-right py-3 px-4 tabular-nums text-muted-foreground"
                    title={formatDateTimeFull(skill.lastUsedAt)}
                  >
                    {formatLastUsed(skill.lastUsedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function OrgSkillsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgSlug = params.orgSlug as string
  const projectId = searchParams.get('projectId') ?? undefined

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <SkillsContent orgSlug={orgSlug} projectId={projectId} />
    </Suspense>
  )
}
