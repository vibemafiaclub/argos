'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { WeeklyReport } from '@/types/reports'

interface UseWeeklyReportOptions {
  projectId?: string
  week?: string  // YYYY-Www. undefined면 서버가 직전 완료 주 기본값 사용
}

export function useWeeklyReport(
  orgSlug: string,
  { projectId, week }: UseWeeklyReportOptions,
) {
  const { data: session } = useSession()

  const qs = new URLSearchParams()
  if (projectId) qs.set('projectId', projectId)
  if (week) qs.set('week', week)
  const suffix = qs.toString()

  return useQuery({
    queryKey: ['reports', 'weekly', orgSlug, { projectId, week }],
    queryFn: () =>
      apiGet<WeeklyReport>(
        `/api/orgs/${orgSlug}/reports${suffix ? `?${suffix}` : ''}`,
        session?.argosToken ?? '',
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
  })
}
