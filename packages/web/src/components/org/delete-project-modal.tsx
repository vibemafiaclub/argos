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
import { useDeleteProject } from '@/hooks/use-delete-project'

interface DeleteProjectModalProps {
  orgSlug: string
  project: { id: string; name: string } | null
  onClose: () => void
}

export function DeleteProjectModal({
  orgSlug,
  project,
  onClose,
}: DeleteProjectModalProps) {
  const [confirmName, setConfirmName] = useState('')
  const mutation = useDeleteProject()

  useEffect(() => {
    if (!project) {
      setConfirmName('')
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  const handleOpenChange = (next: boolean) => {
    if (next) return
    if (mutation.isPending) return
    onClose()
  }

  const canDelete =
    !!project && confirmName === project.name && !mutation.isPending

  const handleDelete = () => {
    if (!project || !canDelete) return
    mutation.mutate(
      { projectId: project.id, orgSlug },
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
      : '프로젝트를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null

  return (
    <AlertDialog open={project !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로젝트를 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-foreground">{project?.name}</strong>{' '}
            프로젝트에 속한 모든 세션, 사용량, 이벤트가 영구적으로 삭제됩니다.
            이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="delete-project-confirm">
            확인을 위해 프로젝트 이름{' '}
            <span className="font-mono text-foreground">{project?.name}</span>
            을(를) 입력해주세요.
          </Label>
          <Input
            id="delete-project-confirm"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={project?.name ?? ''}
            disabled={mutation.isPending}
            autoComplete="off"
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
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canDelete}
            onClick={handleDelete}
          >
            {mutation.isPending ? '삭제 중…' : '삭제'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
