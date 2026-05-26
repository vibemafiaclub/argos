/**
 * WU-4: /api/events 응답 shape 단정 테스트
 *
 * 검증 항목:
 *   (a) 정상 ingest(202) 시 응답 body 에 project.orgSlug 포함
 *   (b) 비멤버(403) 시 응답 body 에 project 필드 없음 (정보 누설 방지)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { ClaudeSession, Event } from '@prisma/client'

// server-only 는 Next.js 런타임 전용 모듈 — 테스트 환경에서 stub 처리
vi.mock('server-only', () => ({}))

// next/server.after 는 Next.js 런타임에서만 동작하므로 no-op 으로 stub
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: vi.fn((fn: () => unknown) => {
      // 테스트에서는 after callback 을 즉시 동기 실행
      try {
        fn()
      } catch {
        // 무시
      }
    }),
  }
})

vi.mock('@/lib/server/auth-helper', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/server/db', () => {
  const db = {
    project: {
      findUnique: vi.fn(),
    },
    claudeSession: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    event: {
      create: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  return { db }
})

vi.mock('@/lib/server/error-helper', () => ({
  handleRouteError: vi.fn((err: unknown) =>
    NextResponse.json({ error: String(err) }, { status: 500 })
  ),
}))

vi.mock('@/lib/server/events', () => ({
  deriveFields: vi.fn(() => ({
    isSkillCall: false,
    skillName: null,
    isSlashCommand: false,
    isAgentCall: false,
    agentType: null,
    agentDesc: null,
  })),
  truncateMessageContent: vi.fn((s: string) => s ?? ''),
  truncateToolResponse: vi.fn((s: unknown) => s),
}))

vi.mock('@/lib/server/cost', () => ({
  calculateCost: vi.fn(() => 0),
}))

import { requireAuth } from '@/lib/server/auth-helper'
import { db } from '@/lib/server/db'
import { POST } from './route'

// 최소 유효 IngestEventSchema payload
const BASE_PAYLOAD = {
  sessionId: 'session-1',
  projectId: 'project-1',
  hookEventName: 'SESSION_START',
}

function makeRequest(body: object = BASE_PAYLOAD) {
  return new Request('http://localhost/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/events — WU-4 응답 shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 기본 auth mock: 인증 성공
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' })
    // claudeSession.upsert 기본 stub
    vi.mocked(db.claudeSession.upsert).mockResolvedValue({} as unknown as ClaudeSession)
    // event.create 기본 stub
    vi.mocked(db.event.create).mockResolvedValue({} as unknown as Event)
  })

  it('(a) 정상 ingest — 202 응답 body 에 project.orgSlug 포함', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'project-1',
      orgId: 'org-1',
      organization: {
        slug: 'my-org',
        memberships: [{ userId: 'user-1', role: 'MEMBER' }],
      },
    } as unknown as Awaited<ReturnType<typeof db.project.findUnique>>)

    const res = await POST(makeRequest())
    expect(res.status).toBe(202)

    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.project).toBeDefined()
    expect(body.project.id).toBe('project-1')
    expect(body.project.orgId).toBe('org-1')
    expect(body.project.orgSlug).toBe('my-org')
  })

  it('(b) 비멤버 — 403 응답 body 에 project 필드 없음 (정보 누설 방지)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'project-1',
      orgId: 'org-1',
      organization: {
        slug: 'my-org',
        memberships: [], // 멤버 없음 → 403
      },
    } as unknown as Awaited<ReturnType<typeof db.project.findUnique>>)

    const res = await POST(makeRequest())
    expect(res.status).toBe(403)

    const body = await res.json()
    // 403 응답에는 project 필드가 없어야 한다 (정답 orgSlug 누설 금지)
    expect(body.project).toBeUndefined()
  })

  it('(c) agent=CODEX 페이로드 → 세션 create 에 agent=CODEX 기록', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'project-1',
      orgId: 'org-1',
      organization: { slug: 'my-org', memberships: [{ userId: 'user-1', role: 'MEMBER' }] },
    } as unknown as Awaited<ReturnType<typeof db.project.findUnique>>)

    await POST(makeRequest({ ...BASE_PAYLOAD, agent: 'CODEX' }))

    expect(db.claudeSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ agent: 'CODEX' }) }),
    )
  })

  it('(d) agent 미지정 → 세션 create 에 agent=CLAUDE (후방호환)', async () => {
    vi.mocked(db.project.findUnique).mockResolvedValue({
      id: 'project-1',
      orgId: 'org-1',
      organization: { slug: 'my-org', memberships: [{ userId: 'user-1', role: 'MEMBER' }] },
    } as unknown as Awaited<ReturnType<typeof db.project.findUnique>>)

    await POST(makeRequest())

    expect(db.claudeSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ agent: 'CLAUDE' }) }),
    )
  })
})
