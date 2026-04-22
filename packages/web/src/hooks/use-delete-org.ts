'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiDelete } from '@/lib/api-client'

export function useDeleteOrg() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orgSlug: string) =>
      apiDelete(`/api/orgs/${orgSlug}`, session?.argosToken ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}
