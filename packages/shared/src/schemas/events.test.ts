/**
 * events.test.ts — IngestEventSchema 와이어 계약 가드
 *
 * 이 스키마는 CLI(`argos hook`) → web(`POST /api/events`) 사이의 유일한
 * 계약이다. 여기가 느슨해지거나 엄격해지면 CLI 가 보내는 이벤트가 통째로
 * 드랍되거나(400) 잘못된 데이터가 DB 에 적재되므로, 현재 동작을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { IngestEventSchema } from './events.js'

const minimalEvent = {
  sessionId: 'sess-1',
  projectId: 'proj-1',
  hookEventName: 'STOP',
}

describe('IngestEventSchema — 필수 필드', () => {
  it('sessionId + projectId + hookEventName 만으로 유효하다', () => {
    const result = IngestEventSchema.safeParse(minimalEvent)
    expect(result.success).toBe(true)
  })

  it.each(['sessionId', 'projectId', 'hookEventName'])('%s 누락 → 실패', (key) => {
    const event: Record<string, unknown> = { ...minimalEvent }
    delete event[key]
    expect(IngestEventSchema.safeParse(event).success).toBe(false)
  })

  it('hookEventName 은 5종 enum 만 허용한다', () => {
    for (const name of ['SESSION_START', 'PRE_TOOL_USE', 'POST_TOOL_USE', 'STOP', 'SUBAGENT_STOP']) {
      expect(IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: name }).success).toBe(true)
    }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: 'USER_PROMPT_SUBMIT' }).success).toBe(false)
  })

  it('agent 는 CLAUDE/CODEX 만 허용한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'CLAUDE' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'CODEX' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'GEMINI' }).success).toBe(false)
  })
})

describe('IngestEventSchema — usage payload', () => {
  const usage = {
    inputTokens: 100,
    outputTokens: 200,
    cacheCreationTokens: 0,
    cacheReadTokens: 50,
  }

  it('4개 토큰 필드가 모두 있어야 한다 (model 은 optional)', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, usage }).success).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, usage: { ...usage, model: 'claude-opus-4-7' } }).success,
    ).toBe(true)

    for (const key of Object.keys(usage)) {
      const partial: Record<string, unknown> = { ...usage }
      delete partial[key]
      expect(IngestEventSchema.safeParse({ ...minimalEvent, usage: partial }).success, `usage.${key} 누락`).toBe(false)
    }
  })

  it('usagePerTurn 항목은 timestamp 가 필수다', () => {
    const turn = { ...usage, timestamp: '2026-06-12T00:00:00Z' }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, usagePerTurn: [turn] }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, usagePerTurn: [usage] }).success).toBe(false)
  })
})

describe('IngestEventSchema — messages payload', () => {
  const message = {
    role: 'HUMAN',
    content: 'hello',
    sequence: 0,
    timestamp: '2026-06-12T00:00:00Z',
  }

  it('role/content/sequence/timestamp 가 필수다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, messages: [message] }).success).toBe(true)
    for (const key of Object.keys(message)) {
      const partial: Record<string, unknown> = { ...message }
      delete partial[key]
      expect(
        IngestEventSchema.safeParse({ ...minimalEvent, messages: [partial] }).success,
        `messages[].${key} 누락`,
      ).toBe(false)
    }
  })

  it('role 은 HUMAN/ASSISTANT/TOOL 만 허용한다', () => {
    for (const role of ['HUMAN', 'ASSISTANT', 'TOOL']) {
      expect(IngestEventSchema.safeParse({ ...minimalEvent, messages: [{ ...message, role }] }).success).toBe(true)
    }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, messages: [{ ...message, role: 'SYSTEM' }] }).success).toBe(false)
  })
})

describe('IngestEventSchema — 길이 제한과 strip 동작', () => {
  it('title 은 500자까지, summary 는 10000자까지 허용한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(500) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(501) }).success).toBe(false)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10000) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10001) }).success).toBe(false)
  })

  it('알 수 없는 키는 거부하지 않고 strip 한다 (zod 기본 동작 — 전방 호환)', () => {
    const result = IngestEventSchema.safeParse({ ...minimalEvent, futureField: 'x' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('futureField' in result.data).toBe(false)
    }
  })
})
