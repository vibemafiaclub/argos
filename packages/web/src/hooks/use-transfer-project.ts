'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import type { TransferProjectResponse } from '@argos/shared'
import { apiPost } from '@/lib/api-client'

interface TransferProjectInput {
  targetOrgSlug: string
}

export function useTransferProject(orgSlug: string, projectId: string) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: TransferProjectInput) =>
      apiPost<TransferProjectResponse>(
        `/api/projects/${projectId}/transfer`,
        session?.argosToken ?? '',
        input
      ),
    onSuccess: (_data, variables) => {
      // 양쪽 org 의 프로젝트 목록 무효화
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      queryClient.invalidateQueries({ queryKey: ['projects', orgSlug] })
      queryClient.invalidateQueries({
        queryKey: ['projects', variables.targetOrgSlug],
      })
      // 대시보드 overview/sessions 캐시를 prefix 매칭으로 일괄 무효화
      // (출발 org 및 도착 org 모두에 걸친 stale 데이터 제거)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
