'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiDelete, apiGet, apiPatch } from '@/lib/api-client'
import type { OrgRole } from '@argos/shared'

export interface MemberListItem {
  membershipId: string
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  role: OrgRole
  joinedAt: string
  sevenDayCostUsd: number
}

export function useMembers(orgSlug: string) {
  const { data: session } = useSession()
  return useQuery({
    queryKey: ['members', orgSlug],
    queryFn: () =>
      apiGet<{ members: MemberListItem[] }>(
        `/api/orgs/${orgSlug}/members`,
        session?.argosToken ?? ''
      ),
    enabled: !!session?.argosToken,
    staleTime: 30_000,
  })
}

export function useUpdateMemberRole(orgSlug: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; role: OrgRole }) =>
      apiPatch<{ ok: true }>(
        `/api/orgs/${orgSlug}/members/${input.userId}`,
        session?.argosToken ?? '',
        { role: input.role }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgSlug] })
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
    },
  })
}

export function useRemoveMember(orgSlug: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete(
        `/api/orgs/${orgSlug}/members/${userId}`,
        session?.argosToken ?? ''
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', orgSlug] })
    },
  })
}
