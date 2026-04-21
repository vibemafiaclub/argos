'use client'

import { use, Suspense } from 'react'
import { useProject } from '@/hooks/use-project'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SettingsForm } from './settings-form'

function SettingsContent({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useProject(projectId)

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (error || !data?.project) {
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>프로젝트 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</span>
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
          프로젝트 정보를 관리합니다.
        </p>
      </div>

      <SettingsForm
        projectId={projectId}
        initialName={data.project.name}
      />
    </div>
  )
}

export default function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)

  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <SettingsContent projectId={projectId} />
    </Suspense>
  )
}
