'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { UsageSeries } from '@argos/shared'

export function useDashboardUsage(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'usage', projectId, from, to],
    queryFn: () =>
      apiGet<{ series: UsageSeries[] }>(
        `/api/projects/${projectId}/dashboard/usage?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
