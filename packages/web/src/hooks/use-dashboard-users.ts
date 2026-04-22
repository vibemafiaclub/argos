'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { PaginatedResult, UserStat } from '@argos/shared'

interface UseDashboardUsersOptions {
  projectId?: string
  from: string
  to: string
  page: number
  pageSize: number
  sort?: 'name' | 'tokens'
}

export function useDashboardUsers(
  orgSlug: string,
  { projectId, from, to, page, pageSize, sort }: UseDashboardUsersOptions,
) {
  const { data: session } = useSession()

  const sortParam = sort === 'tokens' ? '&sort=tokens' : ''
  const projectParam = projectId ? `&projectId=${projectId}` : ''

  return useQuery({
    queryKey: [
      'dashboard',
      'users',
      orgSlug,
      { projectId, from, to, page, pageSize, sort: sort ?? 'name' },
    ],
    queryFn: () =>
      apiGet<PaginatedResult<UserStat>>(
        `/api/orgs/${orgSlug}/dashboard/users?from=${from}&to=${to}&page=${page}&pageSize=${pageSize}${sortParam}${projectParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
    placeholderData: keepPreviousData,
  })
}
