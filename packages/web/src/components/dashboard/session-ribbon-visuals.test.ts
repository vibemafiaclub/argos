import { describe, expect, it } from 'vitest'
import type { ToolEvent, MessageEvent } from '../../lib/timeline-events'
import { segmentVisuals } from './session-ribbon-visuals'

function makeTool(overrides: Partial<ToolEvent>): ToolEvent {
  return {
    kind: 'tool',
    toolName: 'Bash',
    toolInput: null,
    content: '',
    durationMs: null,
    timestamp: '2026-05-14T00:00:00.000Z',
    sequence: 0,
    isSkillCall: false,
    skillName: null,
    isAgentCall: false,
    agentType: null,
    ...overrides,
  }
}

function makeMessage(overrides: Partial<MessageEvent>): MessageEvent {
  return {
    kind: 'message',
    role: 'HUMAN',
    content: '',
    timestamp: '2026-05-14T00:00:00.000Z',
    sequence: 0,
    outputTokens: 0,
    inputTokens: 0,
    estimatedCostUsd: 0,
    model: null,
    ...overrides,
  }
}

describe('segmentVisuals', () => {
  it('case 1 (skill): isSkillCall=true → bg-chart-4, flex 0 0 8px', () => {
    const result = segmentVisuals(
      makeTool({ toolName: 'Skill', isSkillCall: true, skillName: 'foo' }),
    )
    expect(result.bg).toBe('bg-chart-4')
    expect(result.style.flex).toBe('0 0 8px')
  })

  it('case 2 (subagent): isAgentCall=true → bg-chart-4', () => {
    const result = segmentVisuals(
      makeTool({ toolName: 'Task', isAgentCall: true, agentType: 'Explore' }),
    )
    expect(result.bg).toBe('bg-chart-4')
    expect(result.style.flex).toBe('0 0 8px')
  })

  it('case 3 (방어적 분기, 실제로는 발생하지 않는 조합): isSkillCall=true && isAgentCall=true → bg-chart-4', () => {
    const result = segmentVisuals(
      makeTool({ isSkillCall: true, isAgentCall: true }),
    )
    expect(result.bg).toBe('bg-chart-4')
  })

  it('case 4 (plain tool): isSkillCall=false, isAgentCall=false → bg-muted-foreground', () => {
    const result = segmentVisuals(makeTool({ toolName: 'Bash' }))
    expect(result.bg).toBe('bg-muted-foreground')
    expect(result.style.flex).toBe('0 0 8px')
  })

  it('case 5 (HUMAN message): role=HUMAN → bg-brand, flex 0 0 3px', () => {
    const result = segmentVisuals(makeMessage({ role: 'HUMAN' }))
    expect(result.bg).toBe('bg-brand')
    expect(result.style.flex).toBe('0 0 3px')
  })

  it('case 6 (ASSISTANT message): role=ASSISTANT, outputTokens=100 → bg-brand-2, flex 100 0 6px', () => {
    const result = segmentVisuals(makeMessage({ role: 'ASSISTANT', outputTokens: 100 }))
    expect(result.bg).toBe('bg-brand-2')
    expect(result.style.flex).toBe('100 0 6px')
  })

  it('case 7 (ASSISTANT message, outputTokens=0): grow clamps to 1 → flex 1 0 6px', () => {
    const result = segmentVisuals(makeMessage({ role: 'ASSISTANT', outputTokens: 0 }))
    expect(result.bg).toBe('bg-brand-2')
    expect(result.style.flex).toBe('1 0 6px')
  })
})
