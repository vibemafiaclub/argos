'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { SkillStat } from '@argos/shared'

interface UseDashboardSkillsOptions {
  projectId?: string
  from: string
  to: string
}

export function useDashboardSkills(
  orgSlug: string,
  { projectId, from, to }: UseDashboardSkillsOptions,
) {
  const { data: session } = useSession()

  const projectParam = projectId ? `&projectId=${projectId}` : ''

  return useQuery({
    queryKey: ['dashboard', 'skills', orgSlug, { projectId, from, to }],
    queryFn: () =>
      apiGet<{ skills: SkillStat[] }>(
        `/api/orgs/${orgSlug}/dashboard/skills?from=${from}&to=${to}${projectParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
  })
}
