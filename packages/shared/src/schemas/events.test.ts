/**
 * events.test.ts — IngestEventSchema (POST /api/events 의 입력 계약) 가드
 *
 * CLI 의 모든 텔레메트리가 이 스키마 하나를 통과한다. 여기가 느슨해지면
 * UsageRecord/DailyProjectStat 집계가 그대로 오염되므로 계약을 고정한다.
 */

import { describe, it, expect } from 'vitest'
import { IngestEventSchema } from './events.js'

const MINIMAL = {
  sessionId: 'sess-1',
  projectId: 'proj-1',
  hookEventName: 'SESSION_START',
}

const USAGE = {
  inputTokens: 100,
  outputTokens: 200,
  cacheCreationTokens: 30,
  cacheReadTokens: 40,
  model: 'claude-opus-4-7',
}

describe('IngestEventSchema — 골든 패스', () => {
  it('필수 3필드(sessionId/projectId/hookEventName)만으로 통과한다', () => {
    expect(IngestEventSchema.safeParse(MINIMAL).success).toBe(true)
  })

  it('usage·usagePerTurn·messages 가 모두 포함된 STOP 이벤트가 통과한다', () => {
    const full = {
      ...MINIMAL,
      hookEventName: 'STOP',
      agent: 'CODEX',
      usage: USAGE,
      usagePerTurn: [{ ...USAGE, timestamp: '2026-06-01T00:00:00Z' }],
      messages: [
        {
          role: 'TOOL',
          content: 'ok',
          sequence: 0,
          timestamp: '2026-06-01T00:00:00Z',
          toolName: 'Read',
          toolInput: { file_path: '/a.ts' },
          durationMs: 12,
        },
      ],
      title: '세션 제목',
      summary: '요약',
    }
    expect(IngestEventSchema.safeParse(full).success).toBe(true)
  })
})

describe('IngestEventSchema — 필수 필드/enum 거부', () => {
  it('sessionId 가 빠지면 거부한다', () => {
    const rest = { projectId: MINIMAL.projectId, hookEventName: MINIMAL.hookEventName }
    expect(IngestEventSchema.safeParse(rest).success).toBe(false)
  })

  it('정의되지 않은 hookEventName 은 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...MINIMAL, hookEventName: 'NOTIFICATION' }).success).toBe(false)
  })

  it('agent 는 CLAUDE/CODEX 외 값을 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...MINIMAL, agent: 'CURSOR' }).success).toBe(false)
  })

  it('messages 의 role 은 HUMAN/ASSISTANT/TOOL 외 값을 거부한다', () => {
    const msg = { role: 'SYSTEM', content: 'x', sequence: 0, timestamp: 't' }
    expect(IngestEventSchema.safeParse({ ...MINIMAL, messages: [msg] }).success).toBe(false)
  })

  it('usage 는 4개 토큰 필드가 모두 있어야 한다 (cacheReadTokens 누락 거부)', () => {
    const partial: Record<string, unknown> = { ...USAGE }
    delete partial.cacheReadTokens
    expect(IngestEventSchema.safeParse({ ...MINIMAL, usage: partial }).success).toBe(false)
  })

  it('usagePerTurn 항목에 timestamp 가 없으면 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...MINIMAL, usagePerTurn: [USAGE] }).success).toBe(false)
  })
})

describe('IngestEventSchema — 길이 경계', () => {
  it('title 500자는 통과, 501자는 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...MINIMAL, title: 'a'.repeat(500) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...MINIMAL, title: 'a'.repeat(501) }).success).toBe(false)
  })

  it('summary 10000자는 통과, 10001자는 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...MINIMAL, summary: 'a'.repeat(10000) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...MINIMAL, summary: 'a'.repeat(10001) }).success).toBe(false)
  })
})

describe('IngestEventSchema — 현재 동작 고정 (검증 구멍)', () => {
  it('음수 토큰을 통과시킨다 (현재 동작)', () => {
    // TODO(bug): z.number() 에 .int().nonnegative() 가 없어 음수/소수 토큰이
    // 그대로 통과한다. 악성·버그 클라이언트가 음수 usage 를 보내면 비용 집계가
    // 음수로 오염될 수 있다. HEALTH.md 리스크 #1 참고.
    const negative = { ...USAGE, inputTokens: -1_000_000 }
    expect(IngestEventSchema.safeParse({ ...MINIMAL, usage: negative }).success).toBe(true)
  })

  it('스키마에 없는 필드는 결과에서 제거된다 (strip)', () => {
    const parsed = IngestEventSchema.parse({ ...MINIMAL, evil: 'x' })
    expect('evil' in parsed).toBe(false)
  })
})
