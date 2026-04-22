'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiPost } from '@/lib/api-client'

interface CreateProjectInput {
  name: string
}

interface CreateProjectResponse {
  project: {
    id: string
    orgId: string
    slug: string
    name: string
    createdAt: string
    updatedAt: string
  }
}

export function useCreateProject(orgSlug: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      apiPost<CreateProjectResponse>(
        `/api/orgs/${orgSlug}/projects`,
        session?.argosToken ?? '',
        input
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', orgSlug] })
    },
  })
}
