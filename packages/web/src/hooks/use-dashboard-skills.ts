'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { SkillStat } from '@argos/shared'

export function useDashboardSkills(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'skills', projectId, from, to],
    queryFn: () =>
      apiGet<{ skills: SkillStat[] }>(
        `/api/projects/${projectId}/dashboard/skills?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
