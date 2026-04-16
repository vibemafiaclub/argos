'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'

interface Project {
  id: string
  orgId: string
  orgName: string
  name: string
  slug: string
}

export function useProjects() {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['projects'],
    queryFn: () =>
      apiGet<{ projects: Project[] }>('/api/projects', session?.argosToken ?? ''),
    staleTime: 60_000,
    enabled: !!session?.argosToken,
  })
}
