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
import {
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
  type MemberListItem,
} from '@/hooks/use-members'
import { useOrgs } from '@/hooks/use-orgs'
import type { OrgRole } from '@argos/shared'
import { ApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'

function CostBar({ cost, maxCost }: { cost: number; maxCost: number }) {
  const pct = maxCost > 0 ? Math.round((cost / maxCost) * 100) : 0
  const barColor =
    pct >= 67
      ? 'bg-destructive'
      : pct >= 34
        ? 'bg-[var(--color-chart-4)]'
        : 'bg-[var(--color-chart-3)]'

  return (
    <div className="flex items-center gap-2 w-44">
      <div className="flex-1 h-1.5 rounded-sm bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-sm transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-14 text-right shrink-0">
        ${cost.toFixed(2)}
      </span>
    </div>
  )
}

const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
}

const ROLE_DESCRIPTION: Record<OrgRole, string> = {
  OWNER: '조직 전체 권한 (삭제 포함)',
  MANAGER: '멤버·프로젝트 관리, 개인 단위 드릴다운 가능',
  MEMBER: '기본 역할. 팀 세션·개인 드릴다운 열람',
  VIEWER: '팀 집계만. 개인 식별자·전사·세션 리스트 접근 불가',
}

function MembersTable({
  orgSlug,
  members,
  currentRole,
  currentUserId,
}: {
  orgSlug: string
  members: MemberListItem[]
  currentRole: OrgRole
  currentUserId: string
}) {
  const updateRole = useUpdateMemberRole(orgSlug)
  const removeMember = useRemoveMember(orgSlug)
  const [errorByUser, setErrorByUser] = useState<Record<string, string>>({})

  const maxCost = Math.max(...members.map((m) => m.sevenDayCostUsd), 0)
  const canChangeToOwner = currentRole === 'OWNER'
  const adminCount = members.filter(
    (m) => m.role === 'OWNER' || m.role === 'MANAGER'
  ).length

  const handleRoleChange = async (userId: string, role: OrgRole) => {
    setErrorByUser((prev) => ({ ...prev, [userId]: '' }))
    try {
      await updateRole.mutateAsync({ userId, role })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 400
            ? '최소 1명의 Manager가 필요합니다.'
            : err.status === 403
              ? '이 변경 권한이 없습니다.'
              : '변경 실패'
          : '변경 실패'
      setErrorByUser((prev) => ({ ...prev, [userId]: msg }))
    }
  }

  const handleRemove = async (userId: string) => {
    if (
      !confirm('이 멤버를 조직에서 제거합니다. 계속하시겠습니까?')
    )
      return
    setErrorByUser((prev) => ({ ...prev, [userId]: '' }))
    try {
      await removeMember.mutateAsync(userId)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 400
            ? '최소 1명의 Manager가 필요합니다.'
            : err.status === 403
              ? '이 멤버를 제거할 권한이 없습니다.'
              : '제거 실패'
          : '제거 실패'
      setErrorByUser((prev) => ({ ...prev, [userId]: msg }))
    }
  }

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const isSelf = m.userId === currentUserId
        const isLastAdmin =
          (m.role === 'OWNER' || m.role === 'MANAGER') && adminCount <= 1
        const ownerLocked = m.role === 'OWNER' && !canChangeToOwner
        return (
          <div
            key={m.membershipId}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{m.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {m.email}
              </div>
              {errorByUser[m.userId] && (
                <div className="text-xs text-destructive mt-1">
                  {errorByUser[m.userId]}
                </div>
              )}
            </div>
            <CostBar cost={m.sevenDayCostUsd} maxCost={maxCost} />
            <div className="w-40">
              <Select
                value={m.role}
                onValueChange={(v) =>
                  handleRoleChange(m.userId, v as OrgRole)
                }
                disabled={
                  updateRole.isPending || ownerLocked || isLastAdmin
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(canChangeToOwner || m.role === 'OWNER') && (
                    <SelectItem value="OWNER">Owner</SelectItem>
                  )}
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRemove(m.userId)}
              disabled={
                removeMember.isPending ||
                isSelf ||
                ownerLocked ||
                isLastAdmin
              }
            >
              제거
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function MembersPageContent({ orgSlug }: { orgSlug: string }) {
  const { data: session } = useSession()
  const orgs = useOrgs()
  const members = useMembers(orgSlug)

  const currentOrg = orgs.data?.orgs.find((o) => o.slug === orgSlug)
  const currentRole = (currentOrg?.role ?? 'MEMBER') as OrgRole
  const canManage = currentRole === 'OWNER' || currentRole === 'MANAGER'

  if (orgs.isLoading || members.isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Members</h1>
        <Alert variant="destructive">
          <AlertDescription>
            멤버 관리 권한이 없습니다. Manager 이상 역할이 필요합니다.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const membersList = members.data?.members ?? []
  // session.user에는 email만 있을 수 있어 id는 JWT에서 가져옴. 클라이언트 단에서는
  // argosToken을 디코딩하지 않고, 멤버 리스트에서 본인의 email 매칭으로 찾는다.
  const selfEmail = session?.user?.email
  const currentUserId =
    membersList.find((m) => m.email === selfEmail)?.userId ?? ''

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          조직 멤버와 역할을 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>역할 안내</CardTitle>
          <CardDescription>
            역할별 권한 요약. 권한은 API 레이어에서 강제됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
              <li key={r} className="flex gap-3">
                <span className="w-20 font-medium">{ROLE_LABEL[r]}</span>
                <span className="text-muted-foreground">
                  {ROLE_DESCRIPTION[r]}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>멤버 ({membersList.length})</CardTitle>
          <CardDescription>
            역할을 변경하거나 조직에서 제거할 수 있습니다. 최소 1명의 Manager
            또는 Owner가 유지되어야 합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                멤버 목록을 불러오지 못했습니다.
              </AlertDescription>
            </Alert>
          )}
          <MembersTable
            orgSlug={orgSlug}
            members={membersList}
            currentRole={currentRole}
            currentUserId={currentUserId}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = use(params)
  return <MembersPageContent orgSlug={orgSlug} />
}
