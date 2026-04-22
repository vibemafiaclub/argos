import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NoOrganizationState } from '@/components/dashboard/no-organization-state'
import { verifyJwt } from '@/lib/server/jwt'
import { db } from '@/lib/server/db'

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  // session.argosToken에서 userId 추출 후 사용자의 첫 org 로 redirect
  let redirectTo: string | null = null
  try {
    const payload = await verifyJwt(session.argosToken)
    if (payload) {
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

  return <NoOrganizationState email={session.user?.email ?? ''} />
}
