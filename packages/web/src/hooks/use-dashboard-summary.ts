'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { DashboardSummary } from '@argos/shared'

export function useDashboardSummary(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'summary', projectId, from, to],
    queryFn: () =>
      apiGet<DashboardSummary>(
        `/api/projects/${projectId}/dashboard/summary?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
