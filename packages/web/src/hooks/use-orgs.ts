'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet } from '@/lib/api-client'

interface OrgListItem {
  id: string
  slug: string
  name: string
  role: string
  avatarUrl?: string | null
}

export function useOrgs() {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ['orgs'],
    queryFn: () =>
      apiGet<{ orgs: OrgListItem[] }>('/api/orgs', session?.argosToken ?? ''),
    staleTime: 60_000,
    enabled: !!session?.argosToken,
  })
}
