'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { useDeleteOrg } from '@/hooks/use-delete-org'

interface DeleteOrgModalProps {
  open: boolean
  orgSlug: string
  orgName: string
  onOpenChange: (open: boolean) => void
}

export function DeleteOrgModal({
  open,
  orgSlug,
  orgName,
  onOpenChange,
}: DeleteOrgModalProps) {
  const router = useRouter()
  const [confirmName, setConfirmName] = useState('')
  const mutation = useDeleteOrg()

  useEffect(() => {
    if (!open) {
      setConfirmName('')
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    onOpenChange(next)
  }

  const canDelete = confirmName === orgName && !mutation.isPending

  const handleDelete = () => {
    if (!canDelete) return
    mutation.mutate(orgSlug, {
      onSuccess: () => {
        onOpenChange(false)
        router.replace('/dashboard')
      },
    })
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof Error && mutation.error.message
      ? mutation.error.message
      : '조직을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.'
    : null

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>조직을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong className="text-foreground">{orgName}</strong> 조직의 모든
            프로젝트, 세션, 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수
            없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="delete-org-confirm">
            확인을 위해 조직 이름{' '}
            <span className="font-mono text-foreground">{orgName}</span>을(를)
            입력해주세요.
          </Label>
          <Input
            id="delete-org-confirm"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={orgName}
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
            onClick={() => onOpenChange(false)}
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
