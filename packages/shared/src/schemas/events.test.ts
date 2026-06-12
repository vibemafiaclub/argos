import { describe, it, expect } from 'vitest'
import { IngestEventSchema } from './events.js'

const minimalEvent = {
  sessionId: 'sess-1',
  projectId: 'proj-1',
  hookEventName: 'STOP',
}

describe('IngestEventSchema', () => {
  it('최소 필수 필드(sessionId, projectId, hookEventName)만으로 통과한다', () => {
    const result = IngestEventSchema.safeParse(minimalEvent)
    expect(result.success).toBe(true)
  })

  it('usage / usagePerTurn / messages 를 포함한 전체 payload 가 통과한다', () => {
    const result = IngestEventSchema.safeParse({
      ...minimalEvent,
      agent: 'CLAUDE',
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      toolUseId: 'tool-1',
      exitCode: 0,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 5,
        model: 'claude-sonnet-4-6',
      },
      usagePerTurn: [
        {
          inputTokens: 100,
          outputTokens: 50,
          cacheCreationTokens: 10,
          cacheReadTokens: 5,
          timestamp: '2026-06-01T00:00:00Z',
        },
      ],
      messages: [
        {
          role: 'HUMAN',
          content: 'hello',
          sequence: 0,
          timestamp: '2026-06-01T00:00:00Z',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('sessionId 가 없으면 실패한다', () => {
    const withoutSessionId = { projectId: minimalEvent.projectId, hookEventName: minimalEvent.hookEventName }
    expect(IngestEventSchema.safeParse(withoutSessionId).success).toBe(false)
  })

  it('hookEventName 이 enum 밖의 값이면 실패한다', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, hookEventName: 'UNKNOWN_HOOK' }).success,
    ).toBe(false)
  })

  it('agent 는 CLAUDE/CODEX 만 허용한다', () => {
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'CODEX' }).success).toBe(true)
    expect(IngestEventSchema.safeParse({ ...minimalEvent, agent: 'GEMINI' }).success).toBe(false)
  })

  it('title 은 500자까지 허용하고 501자는 거부한다', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(500) }).success,
    ).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, title: 'a'.repeat(501) }).success,
    ).toBe(false)
  })

  it('summary 는 10000자까지 허용하고 10001자는 거부한다', () => {
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10000) }).success,
    ).toBe(true)
    expect(
      IngestEventSchema.safeParse({ ...minimalEvent, summary: 'a'.repeat(10001) }).success,
    ).toBe(false)
  })

  it('usage 에 토큰 필드가 하나라도 빠지면 실패한다', () => {
    const result = IngestEventSchema.safeParse({
      ...minimalEvent,
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 1 }, // cacheReadTokens 누락
    })
    expect(result.success).toBe(false)
  })

  it('messages 의 role 이 HUMAN/ASSISTANT/TOOL 밖이면 실패한다', () => {
    const result = IngestEventSchema.safeParse({
      ...minimalEvent,
      messages: [{ role: 'SYSTEM', content: 'x', sequence: 0, timestamp: '2026-06-01T00:00:00Z' }],
    })
    expect(result.success).toBe(false)
  })

  it('알 수 없는 추가 키는 에러 없이 제거된다 (CLI 신버전 → 구버전 서버 forward-compat)', () => {
    const result = IngestEventSchema.parse({ ...minimalEvent, futureField: 'x' })
    expect(result).not.toHaveProperty('futureField')
    expect(result.sessionId).toBe('sess-1')
  })
})
