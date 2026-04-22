'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiPatch } from '@/lib/api-client'

interface UpdateOrgInput {
  name?: string
  slug?: string
}

interface UpdateOrgResponse {
  org: {
    id: string
    slug: string
    name: string
    avatarUrl?: string | null
    role: string
  }
}

export function useUpdateOrg(orgSlug: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateOrgInput) =>
      apiPatch<UpdateOrgResponse>(
        `/api/orgs/${orgSlug}`,
        session?.argosToken ?? '',
        input
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      queryClient.invalidateQueries({ queryKey: ['org', orgSlug] })
      if (data?.org?.slug && data.org.slug !== orgSlug) {
        queryClient.invalidateQueries({ queryKey: ['org', data.org.slug] })
      }
    },
  })
}
