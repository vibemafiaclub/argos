'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'

interface Project {
  id: string
  slug: string
  name: string
  createdAt: string
  updatedAt: string
}

export function useProjects(orgSlug: string) {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['projects', orgSlug],
    queryFn: () =>
      apiGet<{ projects: Project[] }>(
        `/api/orgs/${orgSlug}/projects`,
        session?.argosToken ?? ''
      ),
    staleTime: 60_000,
    enabled: !!session?.argosToken && !!orgSlug,
  })
}
