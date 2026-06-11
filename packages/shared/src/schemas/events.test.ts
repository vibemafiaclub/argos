/**
 * events.test.ts — IngestEventSchema 회귀 가드
 *
 * CLI hook → POST /api/events 인제스트 경로의 유일한 입력 검증 계약.
 * 이 스키마가 느슨해지면 잘못된 이벤트가 DB 에 쌓이고,
 * 엄격해지면 CLI 가 보낸 이벤트가 조용히 거부된다 (hook 은 항상 exit 0).
 */
import { describe, it, expect } from 'vitest'
import { IngestEventSchema } from './events.js'

const minimal = {
  sessionId: 'sess-1',
  projectId: 'proj-1',
  hookEventName: 'STOP',
}

describe('IngestEventSchema — 필수 필드', () => {
  it('sessionId/projectId/hookEventName 만으로 통과한다 (최소 페이로드)', () => {
    const result = IngestEventSchema.safeParse(minimal)
    expect(result.success).toBe(true)
  })

  it('projectId 가 없으면 거부한다', () => {
    const rest = { sessionId: minimal.sessionId, hookEventName: minimal.hookEventName }
    expect(IngestEventSchema.safeParse(rest).success).toBe(false)
  })

  it('hookEventName 이 enum 밖이면 거부한다 (CLI convertEventType 산출물과의 계약)', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimal, hookEventName: 'SESSION_END' }).success
    ).toBe(false)
  })
})

describe('IngestEventSchema — agent / usage / messages', () => {
  it('agent 는 CLAUDE/CODEX 만 허용한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimal, agent: 'CODEX' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimal, agent: 'CURSOR' }).success).toBe(false)
  })

  it('usage 는 4종 토큰 카운트가 전부 있어야 한다 (model 은 선택)', () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationTokens: 0,
      cacheReadTokens: 5,
    }
    expect(IngestEventSchema.safeParse({ ...minimal, usage }).success).toBe(true)

    const incomplete = { inputTokens: 10, outputTokens: 20, cacheCreationTokens: 0 }
    expect(IngestEventSchema.safeParse({ ...minimal, usage: incomplete }).success).toBe(false)
  })

  it('usagePerTurn 항목에는 timestamp 가 추가로 필요하다', () => {
    const turn = {
      inputTokens: 1,
      outputTokens: 2,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    }
    expect(
      IngestEventSchema.safeParse({ ...minimal, usagePerTurn: [turn] }).success
    ).toBe(false)
    expect(
      IngestEventSchema.safeParse({
        ...minimal,
        usagePerTurn: [{ ...turn, timestamp: '2026-06-01T00:00:00Z' }],
      }).success
    ).toBe(true)
  })

  it('messages 의 role 은 HUMAN/ASSISTANT/TOOL 만 허용한다', () => {
    const message = {
      role: 'HUMAN',
      content: 'hi',
      sequence: 0,
      timestamp: '2026-06-01T00:00:00Z',
    }
    expect(IngestEventSchema.safeParse({ ...minimal, messages: [message] }).success).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimal, messages: [{ ...message, role: 'SYSTEM' }] })
        .success
    ).toBe(false)
  })
})

describe('IngestEventSchema — 길이 제한과 타입 강제', () => {
  it('title 은 500자까지 허용, 501자는 거부한다', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimal, title: 'a'.repeat(500) }).success
    ).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimal, title: 'a'.repeat(501) }).success
    ).toBe(false)
  })

  it('summary 는 10000자까지 허용, 10001자는 거부한다', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimal, summary: 'a'.repeat(10000) }).success
    ).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimal, summary: 'a'.repeat(10001) }).success
    ).toBe(false)
  })

  it('exitCode 는 숫자만 허용한다 (문자열 "0" 은 coercion 없이 거부)', () => {
    expect(IngestEventSchema.safeParse({ ...minimal, exitCode: 0 }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimal, exitCode: '0' }).success).toBe(false)
  })

  it('알 수 없는 키는 에러 없이 제거된다 (zod strip 기본 동작 고정)', () => {
    const result = IngestEventSchema.safeParse({ ...minimal, futureField: 'x' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('futureField' in result.data).toBe(false)
    }
  })
})
