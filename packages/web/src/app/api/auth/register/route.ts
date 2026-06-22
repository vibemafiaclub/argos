import { NextResponse } from 'next/server'
import { RegisterRequestSchema } from '@argos/shared'
import { registerUser } from '@/lib/server/auth-actions'
import { handleRouteError, jsonError } from '@/lib/server/error-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/auth/register
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const input = RegisterRequestSchema.parse(body)

    const result = await registerUser(input)
    if (result === 'EMAIL_IN_USE') {
      return jsonError('EMAIL_IN_USE', 'Email already in use', 409)
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return handleRouteError(err)
  }
}
