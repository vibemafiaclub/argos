import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { OrgSidebar } from '@/components/layout/org-sidebar'
import { OrgHeader } from '@/components/layout/org-header'
import { verifyJwt } from '@/lib/server/jwt'
import { assertOrgAccessBySlug } from '@/lib/server/dashboard'

export default async function OrgDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  const { orgSlug } = await params

  // session.argosToken → userId → org 멤버십 확인
  let orgName = 'Organization'
  try {
    const payload = await verifyJwt(session.argosToken)
    if (payload) {
      const result = await assertOrgAccessBySlug(orgSlug, payload.sub)
      if (result.kind === 'ok') {
        orgName = result.org.name
      }
    }
  } catch {
    // 기본 이름 사용
  }

  return (
    <div className="flex flex-col md:flex-row h-screen">
      <OrgSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <OrgHeader orgName={orgName} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
