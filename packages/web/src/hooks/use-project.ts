'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'

interface ProjectDetail {
  id: string
  orgId: string
  name: string
  slug: string
  createdAt: string
}

export function useProject(projectId: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () =>
      apiGet<{ project: ProjectDetail }>(
        `/api/projects/${projectId}`,
        session?.argosToken ?? ''
      ),
    staleTime: 60_000,
    enabled: !!session?.argosToken && !!projectId,
  })
}
