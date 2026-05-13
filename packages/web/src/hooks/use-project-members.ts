'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { apiDelete, apiGet, apiPost } from '@/lib/api-client'
import type { OrgRole } from '@argos/shared'

export interface ProjectMemberItem {
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  addedAt: string
}

export interface ProjectMemberCandidate {
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  orgRole: OrgRole
}

export interface ProjectMembersData {
  projectId: string
  projectName: string
  members: ProjectMemberItem[]
  candidates: ProjectMemberCandidate[]
}

export function useProjectMembers(orgSlug: string, projectId: string) {
  const { data: session } = useSession()
  return useQuery({
    queryKey: ['project-members', orgSlug, projectId],
    queryFn: () =>
      apiGet<ProjectMembersData>(
        `/api/orgs/${orgSlug}/projects/${projectId}/members`,
        session?.argosToken ?? ''
      ),
    enabled: !!session?.argosToken && !!projectId,
    staleTime: 30_000,
  })
}

export function useAddProjectMember(orgSlug: string, projectId: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiPost<{ ok: true }>(
        `/api/orgs/${orgSlug}/projects/${projectId}/members`,
        session?.argosToken ?? '',
        { userId }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', orgSlug, projectId] })
    },
  })
}

export function useRemoveProjectMember(orgSlug: string, projectId: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiDelete(
        `/api/orgs/${orgSlug}/projects/${projectId}/members/${userId}`,
        session?.argosToken ?? ''
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', orgSlug, projectId] })
    },
  })
}
