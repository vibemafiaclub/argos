'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyPromptButton } from '@/components/copy-prompt-button'
import { CreateOrgModal } from '@/components/org/create-org-modal'

interface NoOrganizationStateProps {
  email: string
  onboardPrompt: string
  onboardTokenExpiresAt: string
}

export function NoOrganizationState({
  email,
  onboardPrompt,
  onboardTokenExpiresAt,
}: NoOrganizationStateProps) {
  const [createOpen, setCreateOpen] = useState(false)

  const expiresAt = new Date(onboardTokenExpiresAt)
  const expiresAtLabel = expiresAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-6 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Argos</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm text-destructive hover:underline"
            >
              Log out
            </button>
          </div>
        </div>

        <hr />

        {/* Primary: copyable prompt */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">
              새 프로젝트를 Claude Code · Codex 에 연결하세요
            </h2>
            <p className="text-sm text-muted-foreground">
              아래 프롬프트를 복사해 새로 추적할 프로젝트 폴더의 Claude Code · Codex 세션에
              붙여넣으면, Argos가 조직·프로젝트·hook 설치까지 자동으로 끝냅니다.
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                토큰 만료: 오늘 {expiresAtLabel} · 1회만 사용 가능
              </div>
              <CopyPromptButton text={onboardPrompt} className="flex-shrink-0" />
            </div>
            <pre className="bg-background text-foreground/90 rounded-md px-3 py-2 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-border">
              {onboardPrompt}
            </pre>
          </div>

          <p className="text-xs text-muted-foreground">
            이미 .argos/project.json 이 커밋된 저장소에 합류하는 팀원은 token 없이
            repo 루트에서 <code className="text-foreground">argos</code> 만 실행하면
            팀에 합류합니다.
          </p>
        </div>

        <hr />

        {/* Secondary: manual path */}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            CLI 없이 먼저 조직만 만들고 싶다면?
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            조직 수동 생성
          </Button>
        </div>
      </div>

      <CreateOrgModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
