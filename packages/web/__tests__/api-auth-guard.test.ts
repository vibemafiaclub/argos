import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import type { Organization } from '@prisma/client'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/server/auth-helper', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/server/dashboard-route-helper', () => ({
  assertOrgAccessBySlugOrResponse: vi.fn(),
}))

vi.mock('@/lib/server/error-helper', () => ({
  handleRouteError: vi.fn((err: unknown) =>
    NextResponse.json({ error: String(err) }, { status: 500 })
  ),
}))

import { requireAuth } from '@/lib/server/auth-helper'
import { assertOrgAccessBySlugOrResponse } from '@/lib/server/dashboard-route-helper'
import { withOrgAuth } from '@/lib/server/route-wrappers'

const organization = {
  id: 'org-1',
  slug: 'acme',
  name: 'Acme',
  githubOrg: null,
  avatarUrl: null,
  createdAt: new Date('2026-06-08T00:00:00Z'),
  updatedAt: new Date('2026-06-08T00:00:00Z'),
} satisfies Organization

describe('withOrgAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )

    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withOrgAuth(handler)

    const res = await wrapped(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ orgSlug: 'acme' }),
    })

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    expect(assertOrgAccessBySlugOrResponse).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no org access', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(assertOrgAccessBySlugOrResponse).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    )

    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withOrgAuth(handler)

    const res = await wrapped(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ orgSlug: 'acme' }),
    })

    expect(res.status).toBe(403)
    expect(assertOrgAccessBySlugOrResponse).toHaveBeenCalledWith('acme', 'user-1')
    expect(handler).not.toHaveBeenCalled()
  })

  it('calls the wrapped handler with auth and org context on success', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(assertOrgAccessBySlugOrResponse).mockResolvedValue({
      org: organization,
      role: 'MANAGER',
    })

    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const wrapped = withOrgAuth(handler)
    const context = { params: Promise.resolve({ orgSlug: 'acme' }) }

    const res = await wrapped(new Request('http://localhost/api/test'), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(
      expect.any(Request),
      context,
      {
        userId: 'user-1',
        orgSlug: 'acme',
        org: organization,
        role: 'MANAGER',
      },
    )
  })
})
