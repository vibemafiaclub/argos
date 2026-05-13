'use client'

import { use, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProjects } from '@/hooks/use-projects'
import {
  useProjectMembers,
  useAddProjectMember,
  useRemoveProjectMember,
  type ProjectMemberItem,
  type ProjectMemberCandidate,
} from '@/hooks/use-project-members'
import { useOrgs } from '@/hooks/use-orgs'
import { ApiError } from '@/lib/api-client'

function MemberRow({
  member,
  onRemove,
  isPending,
}: {
  member: ProjectMemberItem
  onRemove: () => void
  isPending: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{member.name}</div>
        <div className="text-xs text-muted-foreground truncate">{member.email}</div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRemove}
        disabled={isPending}
      >
        제거
      </Button>
    </div>
  )
}

function AddMemberRow({
  candidates,
  onAdd,
  isPending,
}: {
  candidates: ProjectMemberCandidate[]
  onAdd: (userId: string) => void
  isPending: boolean
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const handleAdd = () => {
    if (!selectedUserId) return
    onAdd(selectedUserId)
    setSelectedUserId('')
  }

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        추가할 수 있는 org 멤버가 없습니다.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedUserId}
        onValueChange={(v) => setSelectedUserId(v ?? '')}
        disabled={isPending}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="멤버 선택..." />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.userId} value={c.userId}>
              {c.name} ({c.email})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        onClick={handleAdd}
        disabled={!selectedUserId || isPending}
      >
        추가
      </Button>
    </div>
  )
}

function ProjectMembersPanel({
  orgSlug,
  projectId,
}: {
  orgSlug: string
  projectId: string
}) {
  const { data, isLoading, error } = useProjectMembers(orgSlug, projectId)
  const addMember = useAddProjectMember(orgSlug, projectId)
  const removeMember = useRemoveProjectMember(orgSlug, projectId)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>멤버 목록을 불러오지 못했습니다.</AlertDescription>
      </Alert>
    )
  }

  const members = data?.members ?? []
  const candidates = data?.candidates ?? []

  const handleAdd = async (userId: string) => {
    setErrorMsg(null)
    try {
      await addMember.mutateAsync(userId)
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError && err.status === 400
          ? '해당 유저는 org 멤버가 아닙니다.'
          : '멤버 추가에 실패했습니다.'
      )
    }
  }

  const handleRemove = async (userId: string) => {
    if (!confirm('이 멤버의 프로젝트 접근 권한을 제거합니다. 계속하시겠습니까?'))
      return
    setErrorMsg(null)
    try {
      await removeMember.mutateAsync(userId)
    } catch {
      setErrorMsg('멤버 제거에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-4">
      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          현재 멤버 ({members.length}명) — OWNER/MANAGER는 항상 접근 가능합니다.
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            등록된 멤버가 없습니다.
          </p>
        ) : (
          members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              onRemove={() => handleRemove(m.userId)}
              isPending={removeMember.isPending}
            />
          ))
        )}
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">멤버 추가</p>
        <AddMemberRow
          candidates={candidates}
          onAdd={handleAdd}
          isPending={addMember.isPending}
        />
      </div>
    </div>
  )
}

function ProjectAccessContent({ orgSlug }: { orgSlug: string }) {
  const { data: session } = useSession()
  const orgs = useOrgs()
  const projects = useProjects(orgSlug)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  const currentOrg = orgs.data?.orgs.find((o) => o.slug === orgSlug)
  const role = currentOrg?.role ?? 'MEMBER'
  const canManage = role === 'OWNER' || role === 'MANAGER'

  const isLoading = orgs.isLoading || projects.isLoading

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Project Access</h1>
        <Alert variant="destructive">
          <AlertDescription>
            프로젝트 접근 관리 권한이 없습니다. Manager 이상 역할이 필요합니다.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const projectList = projects.data?.projects ?? []
  const selectedProject = projectList.find((p) => p.id === selectedProjectId)

  // 첫 프로젝트 자동 선택
  if (projectList.length > 0 && !selectedProjectId) {
    setSelectedProjectId(projectList[0].id)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Project Access</h1>
        <p className="text-sm text-muted-foreground mt-1">
          MEMBER / VIEWER 역할은 여기에 등록된 프로젝트만 볼 수 있습니다.
          OWNER / MANAGER는 모든 프로젝트에 자동으로 접근합니다.
        </p>
      </div>

      {projectList.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              프로젝트가 없습니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>프로젝트 선택</CardTitle>
            <CardDescription>
              관리할 프로젝트를 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Select
              value={selectedProjectId}
              onValueChange={(v) => setSelectedProjectId(v ?? '')}
            >
              <SelectTrigger>
                <SelectValue placeholder="프로젝트 선택..." />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProject && selectedProjectId && (
              <ProjectMembersPanel
                orgSlug={orgSlug}
                projectId={selectedProjectId}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function ProjectAccessPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = use(params)
  return <ProjectAccessContent orgSlug={orgSlug} />
}
