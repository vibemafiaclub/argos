'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { DashboardOverview } from '@argos/shared'

interface UseDashboardOverviewOptions {
  projectId?: string
  from: string
  to: string
}

export function useDashboardOverview(
  orgSlug: string,
  { projectId, from, to }: UseDashboardOverviewOptions,
) {
  const { data: session } = useSession()

  const projectParam = projectId ? `&projectId=${projectId}` : ''

  return useQuery({
    queryKey: ['dashboard', 'overview', orgSlug, { projectId, from, to }],
    queryFn: () =>
      apiGet<DashboardOverview>(
        `/api/orgs/${orgSlug}/dashboard/overview?from=${from}&to=${to}${projectParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
  })
}
