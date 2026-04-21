'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { PaginatedResult, SessionItem, SessionDetail } from '@argos/shared'

export type SessionSort = 'recent' | 'tokens'

export function useDashboardSessions(
  projectId: string,
  from: string,
  to: string,
  page: number,
  pageSize: number,
  sort: SessionSort = 'recent',
) {
  const { data: session } = useSession()

  const sortParam = sort === 'tokens' ? '&sort=tokens' : ''

  return useQuery({
    queryKey: ['dashboard', 'sessions', projectId, from, to, page, pageSize, sort],
    queryFn: () =>
      apiGet<PaginatedResult<SessionItem>>(
        `/api/projects/${projectId}/dashboard/sessions?from=${from}&to=${to}&page=${page}&pageSize=${pageSize}${sortParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
    placeholderData: keepPreviousData,
  })
}

export function useSessionDetail(projectId: string, sessionId: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'sessions', projectId, sessionId],
    queryFn: () =>
      apiGet<SessionDetail>(
        `/api/projects/${projectId}/dashboard/sessions/${sessionId}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!sessionId,
  })
}
