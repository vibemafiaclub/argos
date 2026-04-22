'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiPatch } from '@/lib/api-client'

interface UpdateProjectInput {
  name?: string
  slug?: string
}

interface UpdateProjectResponse {
  project: {
    id: string
    orgId: string
    name: string
    slug: string
    createdAt: string
  }
}

export function useUpdateProject(projectId: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      apiPatch<UpdateProjectResponse>(
        `/api/projects/${projectId}`,
        session?.argosToken ?? '',
        input
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      router.refresh()
    },
  })
}
