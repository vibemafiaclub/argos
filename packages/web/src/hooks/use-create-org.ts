'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiPost } from '@/lib/api-client'

interface CreateOrgInput {
  name: string
  slug?: string
}

interface CreateOrgResponse {
  org: {
    id: string
    name: string
    slug: string
  }
}

export function useCreateOrg() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateOrgInput) =>
      apiPost<CreateOrgResponse>(
        '/api/orgs',
        session?.argosToken ?? '',
        input
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}
