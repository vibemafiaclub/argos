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
import { useCreateOrg } from '@/hooks/use-create-org'
import { ApiError } from '@/lib/api-client'

interface CreateOrgModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrgModal({ open, onOpenChange }: CreateOrgModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mutation = useCreateOrg()

  useEffect(() => {
    if (!open) {
      setName('')
      setErrorMessage(null)
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || mutation.isPending) return

    setErrorMessage(null)

    try {
      const result = await mutation.mutateAsync({ name: trimmed })
      onOpenChange(false)
      if (result?.org?.slug) {
        router.push(`/dashboard/${result.org.slug}`)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
          setErrorMessage('입력한 이름이 올바르지 않습니다.')
          return
        }
        if (err.message) {
          setErrorMessage(err.message)
          return
        }
      }
      setErrorMessage('조직을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>새 조직 만들기</AlertDialogTitle>
            <AlertDialogDescription>
              조직 이름을 입력해주세요. URL 에 사용되는 slug 는 이름을 기반으로
              자동 생성되며, 생성 후 설정에서 변경할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="create-org-name">조직 이름</Label>
            <Input
              id="create-org-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              placeholder="예: Acme Inc."
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
