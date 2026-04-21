'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useUpdateProject } from '@/hooks/use-update-project'
import { ApiError } from '@/lib/api-client'

interface SettingsFormProps {
  projectId: string
  initialName: string
}

export function SettingsForm({ projectId, initialName }: SettingsFormProps) {
  const [name, setName] = useState(initialName)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const mutation = useUpdateProject(projectId)

  const trimmed = name.trim()
  const isDirty = trimmed !== initialName
  const isValid = trimmed.length > 0 && trimmed.length <= 100
  const canSubmit = isDirty && isValid && !mutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError(null)
    setSuccessMessage(null)

    if (!canSubmit) return

    try {
      await mutation.mutateAsync({ name: trimmed })
      setSuccessMessage('저장되었습니다.')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PROJECT_NAME_CONFLICT' || err.status === 409) {
          setFieldError('이미 같은 이름의 프로젝트가 있습니다.')
          return
        }
        if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
          setFieldError('입력한 이름이 올바르지 않습니다.')
          return
        }
        if (err.status === 403) {
          setFieldError('이 프로젝트를 수정할 권한이 없습니다.')
          return
        }
      }
      setFieldError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>프로젝트 기본 정보</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">프로젝트 이름</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (fieldError) setFieldError(null)
                if (successMessage) setSuccessMessage(null)
              }}
              maxLength={100}
              aria-invalid={fieldError ? true : undefined}
              disabled={mutation.isPending}
            />
            {fieldError && (
              <p className="text-xs text-destructive">{fieldError}</p>
            )}
            {!fieldError && successMessage && (
              <p className="text-xs text-success">{successMessage}</p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
