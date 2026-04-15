'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'
import type { SessionItem, SessionDetail } from '@argos/shared'

export function useDashboardSessions(projectId: string, from: string, to: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['dashboard', 'sessions', projectId, from, to],
    queryFn: () =>
      apiGet<{ sessions: SessionItem[] }>(
        `/api/projects/${projectId}/dashboard/sessions?from=${from}&to=${to}`,
        session?.argosToken ?? ''
      ),
    staleTime: 30_000,
    enabled: !!session?.argosToken,
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
