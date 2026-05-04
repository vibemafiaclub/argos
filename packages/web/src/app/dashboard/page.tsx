import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NoOrganizationState } from '@/components/dashboard/no-organization-state'
import { verifyJwt } from '@/lib/server/jwt'
import { db } from '@/lib/server/db'
import { issueOnboardToken } from '@/lib/server/auth-actions'

function buildOnboardPrompt(token: string): string {
  return `새 Argos 프로젝트로 추적할 저장소 루트에서 아래 명령을 실행해줘:

npm install -g argos-ai@latest && argos setup --token=${token}

끝나면 .argos/project.json 과 .claude/settings.json 을 커밋해줘.
이미 .argos/project.json 이 커밋된 기존 저장소에 합류하는 팀원은 repo 루트에서 argos 만 실행하면 돼.`
}

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  // session.argosToken에서 userId 추출 후 사용자의 첫 org 로 redirect
  let redirectTo: string | null = null
  let userId: string | null = null
  try {
    const payload = await verifyJwt(session.argosToken)
    if (payload) {
      userId = payload.sub
      const membership = await db.orgMembership.findFirst({
        where: { userId: payload.sub },
        include: { organization: { select: { slug: true } } },
        orderBy: { createdAt: 'asc' },
      })
      if (membership) {
        redirectTo = `/dashboard/${membership.organization.slug}`
      }
    }
  } catch {
    // 실패 시 empty state로 fallback
  }

  if (redirectTo) {
    redirect(redirectTo)
  }

  // org 없음 → 온보딩 토큰 발급해서 프롬프트 렌더
  // userId가 없으면(JWT 파싱 실패) 토큰도 발급 못 하므로 빈 값으로 내려보낸다.
  const onboard = userId
    ? await issueOnboardToken(userId)
    : null

  return (
    <NoOrganizationState
      email={session.user?.email ?? ''}
      onboardPrompt={onboard ? buildOnboardPrompt(onboard.token) : ''}
      onboardTokenExpiresAt={
        onboard ? onboard.expiresAt.toISOString() : new Date().toISOString()
      }
    />
  )
}
