'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { DashboardOverview } from '@argos/shared'

export function useDashboardOverview(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'overview', projectId, from, to],
    queryFn: () =>
      apiGet<DashboardOverview>(
        `/api/projects/${projectId}/dashboard/overview?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
