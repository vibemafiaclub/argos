'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiDelete, apiGet } from '@/lib/api-client'
import type { PaginatedResult, SessionItem, SessionDetail } from '@argos/shared'

export type SessionSort = 'recent' | 'cost'

export function useDashboardSessions(
  projectId: string,
  from: string,
  to: string,
  page: number,
  pageSize: number,
  sort: SessionSort = 'recent',
) {
  const { data: session } = useSession()

  const sortParam = sort === 'cost' ? '&sort=cost' : ''

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

export function useDeleteSession(projectId: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiDelete(
        `/api/projects/${projectId}/dashboard/sessions/${sessionId}`,
        session?.argosToken ?? ''
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'sessions', projectId],
      })
    },
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
