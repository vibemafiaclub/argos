'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useOrgs } from '@/hooks/use-orgs'
import { useUpdateOrg } from '@/hooks/use-update-org'
import { ApiError } from '@/lib/api-client'
import { DeleteOrgModal } from '@/components/org/delete-org-modal'

interface OrgSettingsFormProps {
  orgSlug: string
  initialName: string
  initialSlug: string
  onDeleteClick: () => void
}

function OrgSettingsForm({
  orgSlug,
  initialName,
  initialSlug,
  onDeleteClick,
}: OrgSettingsFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [slug, setSlug] = useState(initialSlug)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const mutation = useUpdateOrg(orgSlug)

  const trimmedName = name.trim()
  const trimmedSlug = slug.trim()
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 100
  const isSlugValid =
    trimmedSlug.length > 0 && /^[a-z0-9-]+$/.test(trimmedSlug)
  const isDirty = trimmedName !== initialName || trimmedSlug !== initialSlug
  const canSubmit = isDirty && isNameValid && isSlugValid && !mutation.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldError(null)
    setSuccessMessage(null)

    if (!canSubmit) return

    const payload: { name?: string; slug?: string } = {}
    if (trimmedName !== initialName) payload.name = trimmedName
    if (trimmedSlug !== initialSlug) payload.slug = trimmedSlug

    try {
      const result = await mutation.mutateAsync(payload)
      const newSlug = result?.org?.slug

      if (newSlug && newSlug !== orgSlug) {
        router.replace(`/dashboard/${newSlug}/settings`)
        return
      }
      setSuccessMessage('저장되었습니다.')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ORG_SLUG_CONFLICT' || err.status === 409) {
          setFieldError('이미 사용 중인 slug 입니다.')
          return
        }
        if (err.code === 'VALIDATION_ERROR' || err.status === 400) {
          setFieldError(
            'slug 는 소문자, 숫자, 하이픈(-) 만 사용할 수 있습니다.'
          )
          return
        }
        if (err.status === 403) {
          setFieldError('이 조직을 수정할 권한이 없습니다.')
          return
        }
      }
      setFieldError('저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>조직 기본 정보</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">조직 이름</Label>
              <Input
                id="org-name"
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value)
                  if (fieldError) setFieldError(null)
                  if (successMessage) setSuccessMessage(null)
                }}
                placeholder="acme"
                aria-invalid={fieldError ? true : undefined}
                disabled={mutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                URL 에 사용됩니다. 소문자, 숫자, 하이픈(-) 만 가능합니다.
              </p>
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

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            조직 삭제는 되돌릴 수 없습니다. 모든 프로젝트와 데이터가 함께
            삭제됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium text-foreground">조직 삭제</p>
              <p className="text-xs text-muted-foreground">
                이 조직과 모든 프로젝트·세션·이벤트를 영구 삭제합니다.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDeleteClick}
            >
              조직 삭제
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function OrgSettingsContent({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error, refetch } = useOrgs()
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const currentOrg = data?.orgs.find((o) => o.slug === orgSlug)

  if (error || !currentOrg) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>
              조직 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              재시도
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          조직 정보를 관리합니다.
        </p>
      </div>

      <OrgSettingsForm
        key={`${currentOrg.slug}:${currentOrg.name}`}
        orgSlug={currentOrg.slug}
        initialName={currentOrg.name}
        initialSlug={currentOrg.slug}
        onDeleteClick={() => setDeleteOpen(true)}
      />

      <DeleteOrgModal
        open={deleteOpen}
        orgSlug={currentOrg.slug}
        orgName={currentOrg.name}
        onOpenChange={setDeleteOpen}
      />
    </div>
  )
}

export default function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = use(params)
  return <OrgSettingsContent orgSlug={orgSlug} />
}
