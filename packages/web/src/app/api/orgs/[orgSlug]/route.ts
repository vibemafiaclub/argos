import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/server/db'
import { requireAuth } from '@/lib/server/auth-helper'
import { handleRouteError } from '@/lib/server/error-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UpdateOrgSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.slug !== undefined, {
    message: 'At least one of name or slug is required',
  })

// GET /api/orgs/:orgSlug
export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    const { org, role } = access

    return NextResponse.json({
      org: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        avatarUrl: org.avatarUrl,
        role,
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}

// PATCH /api/orgs/:orgSlug
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    const body = await req.json()
    const input = UpdateOrgSchema.parse(body)

    try {
      const updated = await db.organization.update({
        where: { id: access.org.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
        },
      })

      return NextResponse.json({
        org: {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
          avatarUrl: updated.avatarUrl,
          role: access.role,
        },
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'ORG_SLUG_CONFLICT',
              message: '이미 사용 중인 slug 입니다.',
            },
          },
          { status: 409 }
        )
      }
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}

// DELETE /api/orgs/:orgSlug
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  try {
    const auth = await requireAuth(req)
    if (auth instanceof NextResponse) return auth
    const { userId } = auth

    const { orgSlug } = await params

    const access = await assertOrgAccessBySlugOrResponse(orgSlug, userId)
    if (access instanceof NextResponse) return access

    await db.organization.delete({ where: { id: access.org.id } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
