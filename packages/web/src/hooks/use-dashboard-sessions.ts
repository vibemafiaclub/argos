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

interface UseDashboardSessionsOptions {
  projectId?: string
  from: string
  to: string
  page: number
  pageSize: number
  sort?: SessionSort
}

export function useDashboardSessions(
  orgSlug: string,
  {
    projectId,
    from,
    to,
    page,
    pageSize,
    sort = 'recent',
  }: UseDashboardSessionsOptions,
) {
  const { data: session } = useSession()

  const sortParam = sort === 'cost' ? '&sort=cost' : ''
  const projectParam = projectId ? `&projectId=${projectId}` : ''

  return useQuery({
    queryKey: [
      'dashboard',
      'sessions',
      orgSlug,
      { projectId, from, to, page, pageSize, sort },
    ],
    queryFn: () =>
      apiGet<PaginatedResult<SessionItem>>(
        `/api/orgs/${orgSlug}/dashboard/sessions?from=${from}&to=${to}&page=${page}&pageSize=${pageSize}${sortParam}${projectParam}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug,
    placeholderData: keepPreviousData,
  })
}

export function useDeleteSession(orgSlug: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) =>
      apiDelete(
        `/api/orgs/${orgSlug}/dashboard/sessions/${sessionId}`,
        session?.argosToken ?? ''
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard', 'sessions', orgSlug],
      })
    },
  })
}

export function useSessionDetail(orgSlug: string, sessionId: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'sessions', orgSlug, sessionId],
    queryFn: () =>
      apiGet<SessionDetail>(
        `/api/orgs/${orgSlug}/dashboard/sessions/${sessionId}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken && !!orgSlug && !!sessionId,
  })
}
