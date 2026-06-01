import { describe, expect, it } from 'vitest'
import { messagesToTimeline, buildTimelineGroups } from './timeline-events'

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

describe('buildTimelineGroups', () => {
  it('skill/subagent events are not merged even when same toolName repeats consecutively', () => {
    const events = messagesToTimeline([
      {
        role: 'TOOL',
        content: 'result1',
        sequence: 0,
        timestamp: '2026-05-14T00:00:00.000Z',
        outputTokens: 0,
        inputTokens: 0,
        estimatedCostUsd: 0,
        model: null,
        toolName: 'Bash',
        toolInput: null,
        toolUseId: 'toolu_1',
        durationMs: null,
      },
      {
        role: 'TOOL',
        content: 'result2',
        sequence: 1,
        timestamp: '2026-05-14T00:00:01.000Z',
        outputTokens: 0,
        inputTokens: 0,
        estimatedCostUsd: 0,
        model: null,
        toolName: 'Skill',
        toolInput: { skill: 'foo' },
        toolUseId: 'toolu_2',
        durationMs: null,
      },
      {
        role: 'TOOL',
        content: 'result3',
        sequence: 2,
        timestamp: '2026-05-14T00:00:02.000Z',
        outputTokens: 0,
        inputTokens: 0,
        estimatedCostUsd: 0,
        model: null,
        toolName: 'Bash',
        toolInput: null,
        toolUseId: 'toolu_3',
        durationMs: null,
      },
    ])

    // The Skill event has isSkillCall=true, so it must not be merged into a toolRun group.
    const groups = buildTimelineGroups(events)

    // Skill splits the two Bash events into separate toolRun groups:
    // [toolRun(Bash), single(Skill), toolRun(Bash)]
    expect(groups).toHaveLength(3)
    expect(groups[0].kind).toBe('toolRun')
    expect(groups[1].kind).toBe('single')
    expect(groups[2].kind).toBe('toolRun')

    // Skill event should appear as a 'single' group, not part of any toolRun
    const skillGroups = groups.filter(
      (g) => g.kind === 'single' && g.event.kind === 'tool' && g.event.isSkillCall,
    )
    expect(skillGroups).toHaveLength(1)

    // Verify no toolRun group contains a skill or subagent item
    for (const group of groups) {
      if (group.kind === 'toolRun') {
        for (const { event } of group.items) {
          expect(event.isSkillCall).toBe(false)
          expect(event.isAgentCall).toBe(false)
        }
      }
    }
  })
})
