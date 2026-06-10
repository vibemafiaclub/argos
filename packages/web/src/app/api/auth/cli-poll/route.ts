import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/server/db'
import { handleRouteError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/auth/cli-poll
export async function GET(req: NextRequest) {
  try {
    const state = req.nextUrl.searchParams.get('state')
    if (!state) {
      return NextResponse.json({ error: 'Missing state' }, { status: 400 })
    }

    const request = await db.cliAuthRequest.findUnique({ where: { state } })
    if (!request) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (new Date() > request.expiresAt) {
      return NextResponse.json({ error: 'Expired' }, { status: 410 })
    }

    if (request.denied) {
      return NextResponse.json({ denied: true })
    }

    if (!request.approved || !request.token) {
      return NextResponse.json({ pending: true })
    }

    // Consume the token (1-use): clear it so subsequent polls return pending.
    await db.cliAuthRequest.update({
      where: { id: request.id },
      data: { token: null },
    })

    return NextResponse.json({ token: request.token })
  } catch (err) {
    return handleRouteError(err)
  }
}
