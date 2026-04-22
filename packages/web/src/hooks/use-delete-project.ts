'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiDelete } from '@/lib/api-client'

interface DeleteProjectVariables {
  projectId: string
  orgSlug: string
}

export function useDeleteProject() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId }: DeleteProjectVariables) =>
      apiDelete(`/api/projects/${projectId}`, session?.argosToken ?? ''),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.orgSlug],
      })
    },
  })
}
