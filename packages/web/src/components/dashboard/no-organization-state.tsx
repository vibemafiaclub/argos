'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateOrgModal } from '@/components/org/create-org-modal'

interface NoOrganizationStateProps {
  email: string
}

export function NoOrganizationState({ email }: NoOrganizationStateProps) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-6 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
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

        {/* Empty state message */}
        <div className="space-y-1">
          <h2 className="text-lg font-medium">아직 속한 조직이 없습니다</h2>
          <p className="text-sm text-muted-foreground">
            조직을 만들어 팀원들과 함께 Argos 로 토큰 사용량을 추적해보세요.
            조직 안에서 여러 프로젝트를 만들고 관리할 수 있습니다.
          </p>
        </div>

        <div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            조직 만들기
          </Button>
        </div>
      </div>

      <CreateOrgModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
