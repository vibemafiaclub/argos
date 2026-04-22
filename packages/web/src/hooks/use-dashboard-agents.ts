'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { AgentStat } from '@argos/shared'

interface UseDashboardAgentsOptions {
  projectId?: string
  from: string
  to: string
}

export function useDashboardAgents(
  orgSlug: string,
  { projectId, from, to }: UseDashboardAgentsOptions,
) {
  const { data: session } = useSession()

  const projectParam = projectId ? `&projectId=${projectId}` : ''

  return useQuery({
    queryKey: ['dashboard', 'agents', orgSlug, { projectId, from, to }],
    queryFn: () =>
      apiGet<{ agents: AgentStat[] }>(
        `/api/orgs/${orgSlug}/dashboard/agents?from=${from}&to=${to}${projectParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
  })
}
