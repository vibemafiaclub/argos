import { describe, expect, it } from 'vitest'
import { IngestEventSchema } from './events.js'

const minimalEvent = {
  sessionId: 'sess-1',
  projectId: 'proj-1',
  hookEventName: 'SESSION_START',
}

describe('IngestEventSchema', () => {
  it('필수 필드(sessionId, projectId, hookEventName)만으로 통과한다', () => {
    const result = IngestEventSchema.safeParse(minimalEvent)
    expect(result.success).toBe(true)
  })

  it('필수 필드가 빠지면 실패한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, sessionId: undefined }).success).toBe(false)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, projectId: undefined }).success).toBe(false)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: undefined }).success).toBe(false)
  })

  it('hookEventName 은 5개 enum 값만 허용한다', () => {
    for (const name of ['SESSION_START', 'PRE_TOOL_USE', 'POST_TOOL_USE', 'STOP', 'SUBAGENT_STOP']) {
      expect(IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: name }).success).toBe(true)
    }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: 'USER_PROMPT_SUBMIT' }).success).toBe(false)
  })

  it('agent 는 CLAUDE/CODEX 만 허용하고 생략 가능하다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'CLAUDE' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'CODEX' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'GEMINI' }).success).toBe(false)
  })

  it('usage payload 는 4개 토큰 필드가 모두 number 여야 한다', () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheCreationTokens: 0, cacheReadTokens: 3 }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, usage }).success).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, usage: { ...usage, cacheReadTokens: undefined } }).success,
    ).toBe(false)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, usage: { ...usage, inputTokens: '1' } }).success,
    ).toBe(false)
  })

  it('usagePerTurn 항목은 usage 필드 + timestamp(string) 를 요구한다', () => {
    const turn = { inputTokens: 1, outputTokens: 2, cacheCreationTokens: 0, cacheReadTokens: 0, timestamp: '2026-06-12T00:00:00Z' }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, usagePerTurn: [turn] }).success).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, usagePerTurn: [{ ...turn, timestamp: undefined }] }).success,
    ).toBe(false)
  })

  it('messages 의 role 은 HUMAN/ASSISTANT/TOOL 만 허용한다', () => {
    const message = { role: 'HUMAN', content: 'hi', sequence: 0, timestamp: '2026-06-12T00:00:00Z' }
    expect(IngestEventSchema.safeParse({ ...minimalEvent, messages: [message] }).success).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, messages: [{ ...message, role: 'SYSTEM' }] }).success,
    ).toBe(false)
  })

  it('title 500자 / summary 10000자 초과는 거부한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(500) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(501) }).success).toBe(false)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10000) }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10001) }).success).toBe(false)
  })

  // TODO(bug): 스키마에 .strict() 가 없어 알 수 없는 키가 조용히 통과(strip)된다.
  // CLI 가 필드 이름을 오타내면 (예: toolNmae) 서버는 에러 없이 해당 필드를 버린다.
  // 계약 드리프트를 조기에 잡으려면 strict 또는 passthrough 정책을 명시해야 한다. 현재 동작을 고정한다.
  it('알 수 없는 키는 에러 없이 strip 된다 (현재 동작)', () => {
    const result = IngestEventSchema.safeParse({ ...minimalEvent, toolNmae: 'Bash' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('toolNmae' in result.data).toBe(false)
    }
  })
})
