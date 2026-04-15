'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { AgentStat } from '@argos/shared'

export function useDashboardAgents(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'agents', projectId, from, to],
    queryFn: () =>
      apiGet<{ agents: AgentStat[] }>(
        `/api/projects/${projectId}/dashboard/agents?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
