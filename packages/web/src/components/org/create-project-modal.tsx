'use client'

import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateProject } from '@/hooks/use-create-project'

interface CreateProjectModalProps {
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectModal({
  orgSlug,
  open,
  onOpenChange,
}: CreateProjectModalProps) {
  const [name, setName] = useState('')
  const mutation = useCreateProject(orgSlug)

  useEffect(() => {
    if (!open) {
      setName('')
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || mutation.isPending) return
    mutation.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof Error && mutation.error.message
      ? mutation.error.message
      : '프로젝트를 생성하지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>새 프로젝트 만들기</AlertDialogTitle>
            <AlertDialogDescription>
              프로젝트 이름을 입력해주세요. 생성 후 사이드바와 프로젝트 목록에
              바로 추가됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="create-project-name">프로젝트 이름</Label>
            <Input
              id="create-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: my-app"
              autoFocus
              disabled={mutation.isPending}
              aria-invalid={!!errorMessage || undefined}
            />
            {errorMessage && (
              <p className="text-xs text-destructive">{errorMessage}</p>
            )}
          </div>

          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || mutation.isPending}
            >
              {mutation.isPending ? '생성 중…' : '생성'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
