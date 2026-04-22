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
import { useUpdateProject } from '@/hooks/use-update-project'

interface RenameProjectModalProps {
  project: { id: string; name: string } | null
  onClose: () => void
}

export function RenameProjectModal({
  project,
  onClose,
}: RenameProjectModalProps) {
  const [name, setName] = useState('')
  const mutation = useUpdateProject(project?.id ?? '')

  useEffect(() => {
    if (project) {
      setName(project.name)
    } else {
      setName('')
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const handleOpenChange = (next: boolean) => {
    if (next) return
    if (mutation.isPending) return
    onClose()
  }

  const trimmed = name.trim()
  const canSubmit =
    !!project &&
    trimmed.length > 0 &&
    trimmed !== project.name &&
    !mutation.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !canSubmit) return
    mutation.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof Error && mutation.error.message
      ? mutation.error.message
      : '프로젝트 이름을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null

  return (
    <AlertDialog open={project !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 이름 변경</AlertDialogTitle>
            <AlertDialogDescription>
              프로젝트의 새 이름을 입력해주세요. slug (URL) 은 변경되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="rename-project-name">프로젝트 이름</Label>
            <Input
              id="rename-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={project?.name ?? ''}
              autoFocus
              disabled={mutation.isPending}
              autoComplete="off"
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
              onClick={onClose}
            >
              취소
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {mutation.isPending ? '변경 중…' : '변경'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
