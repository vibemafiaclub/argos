'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { UserStat } from '@argos/shared'

export function useDashboardUsers(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'users', projectId, from, to],
    queryFn: () =>
      apiGet<{ users: UserStat[] }>(
        `/api/projects/${projectId}/dashboard/users?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
  })
}
