import { NextRequest, NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/server/admin-auth'
import { db } from '@/lib/server/db'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req)
  if (unauthorized) return unauthorized

  try {
    const query = req.nextUrl.searchParams.get('query')?.trim() ?? ''
    const where =
      query.length > 0
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' as const } },
              { name: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : undefined

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            organization: {
              select: { name: true, slug: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({ users })
  } catch (err) {
    return handleRouteError(err)
  }
}
