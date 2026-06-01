import { describe, expect, it } from 'vitest'
import { messagesToTimeline } from './timeline-events'

describe('messagesToTimeline', () => {
  it('marks Task tool messages with subagent_type as subagent calls', () => {
    const events = messagesToTimeline([
      {
        role: 'TOOL',
        content: 'done',
        sequence: 0,
        timestamp: '2026-05-04T07:13:40.756Z',
        outputTokens: 0,
        inputTokens: 0,
        estimatedCostUsd: 0,
        model: null,
        toolName: 'Task',
        toolInput: {
          subagent_type: 'Explore',
          description: 'Find Android WebView UA config',
        },
        toolUseId: 'toolu_1',
        durationMs: 37658,
      },
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'tool',
      toolName: 'Task',
      isAgentCall: true,
      agentType: 'Explore',
      isSkillCall: false,
    })
  })

  it('keeps ordinary Task tool messages grouped as regular tools', () => {
    const events = messagesToTimeline([
      {
        role: 'TOOL',
        content: 'done',
        sequence: 0,
        timestamp: '2026-05-04T07:13:40.756Z',
        outputTokens: 0,
        inputTokens: 0,
        estimatedCostUsd: 0,
        model: null,
        toolName: 'Task',
        toolInput: { prompt: 'do work' },
        toolUseId: 'toolu_1',
        durationMs: 37658,
      },
    ])

    expect(events[0]).toMatchObject({
      kind: 'tool',
      toolName: 'Task',
      isAgentCall: false,
      agentType: null,
    })
  })
})
