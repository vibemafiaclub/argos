'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiGet, apiPatch } from '@/lib/api-client'
import type { ClaudePlan } from '@argos/shared'

interface MeUser {
  id: string
  email: string
  name: string
  claudePlan: ClaudePlan | null
  createdAt: string
}

export function useMe() {
  const { data: session } = useSession()
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: MeUser }>('/api/auth/me', session?.argosToken ?? ''),
    enabled: !!session?.argosToken,
    staleTime: 60_000,
  })
}

export function useUpdateMe() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { claudePlan: ClaudePlan | null }) =>
      apiPatch<{ user: MeUser }>('/api/auth/me', session?.argosToken ?? '', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
