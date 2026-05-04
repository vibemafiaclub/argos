import { describe, expect, it } from 'vitest'
import { deriveFields } from './events'

describe('deriveFields', () => {
  it('marks normalized slash commands as skill calls', () => {
    expect(
      deriveFields({
        projectId: 'project-1',
        sessionId: 'session-1',
        hookEventName: 'SESSION_START',
        isSlashCommand: true,
        toolInput: { skill: 'new-task-doc' },
      })
    ).toMatchObject({
      isSkillCall: true,
      skillName: 'new-task-doc',
      isSlashCommand: true,
    })
  })

  it('keeps ordinary SessionStart events out of skill aggregates', () => {
    expect(
      deriveFields({
        projectId: 'project-1',
        sessionId: 'session-1',
        hookEventName: 'SESSION_START',
      })
    ).toMatchObject({
      isSkillCall: false,
      skillName: null,
      isSlashCommand: false,
    })
  })
})
