import { NextResponse } from 'next/server'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/orgs/:orgSlug/members
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug } = await params

    const org = await db.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    })

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // 이미 멤버인지 확인 (멱등성)
    const existingMembership = await db.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId: org.id } },
    })

    if (existingMembership) {
      return NextResponse.json({ ok: true })
    }

    // OrgMembership(MEMBER) 생성
    await db.orgMembership.create({
      data: {
        userId,
        orgId: org.id,
        role: 'MEMBER',
      },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
