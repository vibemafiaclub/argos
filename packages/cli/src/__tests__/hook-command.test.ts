import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'stream'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { convertEventType, buildPayload, makeHookCommand } from '../commands/hook.js'
import type { ExternalDeps } from '../deps.js'

// ---------------------------------------------------------------------------
// convertEventType
// ---------------------------------------------------------------------------
describe('convertEventType', () => {
  it.each([
    ['SessionStart', 'SESSION_START'],
    ['PreToolUse', 'PRE_TOOL_USE'],
    ['PostToolUse', 'POST_TOOL_USE'],
    ['Stop', 'STOP'],
    ['SubagentStop', 'SUBAGENT_STOP'],
  ])('converts %s → %s', (input, expected) => {
    expect(convertEventType(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// buildPayload
// ---------------------------------------------------------------------------
describe('buildPayload', () => {
  const project = { projectId: 'proj-1', apiUrl: 'https://api.example.com' }

  it('sets base fields correctly', () => {
    const payload = buildPayload(
      { hook_event_name: 'Stop', session_id: 'sess-abc' },
      project
    )

    expect(payload.projectId).toBe('proj-1')
    expect(payload.sessionId).toBe('sess-abc')
    expect(payload.hookEventName).toBe('STOP')
  })

  it('omits optional fields when not provided', () => {
    const payload = buildPayload({ hook_event_name: 'Stop', session_id: 'x' }, project)

    expect(payload.toolName).toBeUndefined()
    expect(payload.toolInput).toBeUndefined()
    expect(payload.toolResponse).toBeUndefined()
    expect(payload.exitCode).toBeUndefined()
    expect(payload.agentId).toBeUndefined()
  })

  it('includes tool fields when present', () => {
    const payload = buildPayload(
      {
        hook_event_name: 'PreToolUse',
        session_id: 'x',
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
      },
      project
    )

    expect(payload.toolName).toBe('Bash')
    expect(payload.toolInput).toEqual({ command: 'ls' })
  })

  it('truncates tool_response to 2000 characters', () => {
    const longResponse = 'x'.repeat(3000)
    const payload = buildPayload(
      { hook_event_name: 'PostToolUse', session_id: 'x', tool_response: longResponse },
      project
    )

    expect(payload.toolResponse!.length).toBe(2000)
  })

  it('keeps tool_response as-is when under 2000 characters', () => {
    const payload = buildPayload(
      { hook_event_name: 'PostToolUse', session_id: 'x', tool_response: 'short output' },
      project
    )

    expect(payload.toolResponse).toBe('short output')
  })

  it('includes exit_code when provided (including 0)', () => {
    const payload = buildPayload(
      { hook_event_name: 'Stop', session_id: 'x', exit_code: 0 },
      project
    )
    expect(payload.exitCode).toBe(0)
  })

  it('includes agent_id when provided', () => {
    const payload = buildPayload(
      { hook_event_name: 'SubagentStop', session_id: 'x', agent_id: 'agent-123' },
      project
    )
    expect(payload.agentId).toBe('agent-123')
  })
})

// ---------------------------------------------------------------------------
// makeHookCommand — orchestration
// ---------------------------------------------------------------------------

const MOCK_PROJECT = {
  projectId: 'proj-1',
  orgId: 'org-1',
  orgName: 'Test Org',
  projectName: 'Test Project',
  apiUrl: 'https://api.example.com',
}
const MOCK_CONFIG = {
  token: 'test-token',
  apiUrl: 'https://api.example.com',
  userId: 'user-1',
  email: 'test@example.com',
}

function makeStdin(data: string): Readable {
  const stream = new Readable({ read() {} })
  stream.push(data)
  stream.push(null)
  return stream
}

function setStdin(stream: Readable) {
  Object.defineProperty(process, 'stdin', { value: stream, writable: true, configurable: true })
}

function makeMockDeps(overrides: Partial<ExternalDeps> = {}): ExternalDeps {
  const sendBackground = vi.fn()
  const extractUsage = vi.fn().mockResolvedValue(null)
  const detectSlashCommand = vi.fn().mockResolvedValue(null)
  const extractMessages = vi.fn().mockResolvedValue([])

  return {
    config: {
      read: vi.fn().mockReturnValue(MOCK_CONFIG),
      write: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      find: vi.fn().mockReturnValue(MOCK_PROJECT),
      write: vi.fn(),
    },
    auth: {
      login: vi.fn(),
    },
    api: {
      createProject: vi.fn(),
      joinOrg: vi.fn(),
      ensureMembership: vi.fn(),
      revokeToken: vi.fn(),
    },
    hooks: {
      inject: vi.fn().mockReturnValue('already_present'),
      fileExists: vi.fn().mockReturnValue(false),
    },
    prompt: {
      input: vi.fn(),
    },
    transcript: {
      extractUsage,
      detectSlashCommand,
      extractMessages,
    },
    events: {
      sendBackground,
    },
    cwd: vi.fn().mockReturnValue('/test/cwd'),
    ...overrides,
  } as ExternalDeps
}

describe('makeHookCommand orchestration', () => {
  let originalStdin: NodeJS.ReadStream
  let tempDir: string

  beforeEach(() => {
    originalStdin = process.stdin
    tempDir = mkdtempSync(join(tmpdir(), 'argos-hook-test-'))
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true })
    rmSync(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('always exits with code 0', async () => {
    const deps = makeMockDeps()
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x' })))
    await makeHookCommand(deps)({})
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('exits 0 immediately when stdin has no data', async () => {
    const deps = makeMockDeps()
    const emptyStream = new Readable({ read() {} })
    emptyStream.push(null)
    setStdin(emptyStream)

    await makeHookCommand(deps)({})
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(deps.events.sendBackground).not.toHaveBeenCalled()
  })

  it('exits 0 immediately when project config is missing', async () => {
    const deps = makeMockDeps({
      project: { find: vi.fn().mockReturnValue(null), write: vi.fn() },
    })
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await makeHookCommand(deps)({})
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(deps.events.sendBackground).not.toHaveBeenCalled()
  })

  it('exits 0 immediately when user config is missing', async () => {
    const deps = makeMockDeps({
      config: { read: vi.fn().mockReturnValue(null), write: vi.fn(), delete: vi.fn() },
    })
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await makeHookCommand(deps)({})
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(deps.events.sendBackground).not.toHaveBeenCalled()
  })

  it('calls sendBackground for a valid event', async () => {
    const deps = makeMockDeps()
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x' })))
    await makeHookCommand(deps)({})
    expect(deps.events.sendBackground).toHaveBeenCalled()
  })

  it('calls extractUsage and extractMessages for Stop event', async () => {
    const deps = makeMockDeps()
    const transcriptPath = join(tempDir, 'transcript.jsonl')
    writeFileSync(transcriptPath, '', 'utf8')

    setStdin(
      makeStdin(
        JSON.stringify({ hook_event_name: 'Stop', session_id: 'x', transcript_path: transcriptPath })
      )
    )
    await makeHookCommand(deps)({})

    expect(deps.transcript.extractUsage).toHaveBeenCalledWith(transcriptPath)
    expect(deps.transcript.extractMessages).toHaveBeenCalledWith(transcriptPath)
  })

  it('calls extractUsage and extractMessages for SubagentStop event', async () => {
    const deps = makeMockDeps()
    const transcriptPath = join(tempDir, 'agent.jsonl')
    writeFileSync(transcriptPath, '', 'utf8')

    setStdin(
      makeStdin(
        JSON.stringify({
          hook_event_name: 'SubagentStop',
          session_id: 'x',
          agent_transcript_path: transcriptPath,
        })
      )
    )
    await makeHookCommand(deps)({})

    expect(deps.transcript.extractUsage).toHaveBeenCalledWith(transcriptPath)
    expect(deps.transcript.extractMessages).toHaveBeenCalledWith(transcriptPath)
  })

  it('calls detectSlashCommand for SessionStart event', async () => {
    const deps = makeMockDeps()
    const transcriptPath = join(tempDir, 'transcript.jsonl')
    writeFileSync(transcriptPath, '', 'utf8')

    setStdin(
      makeStdin(
        JSON.stringify({
          hook_event_name: 'SessionStart',
          session_id: 'x',
          transcript_path: transcriptPath,
        })
      )
    )
    await makeHookCommand(deps)({})

    expect(deps.transcript.detectSlashCommand).toHaveBeenCalledWith(transcriptPath)
    expect(deps.transcript.extractUsage).not.toHaveBeenCalled()
  })

  it('does NOT call transcript functions for PreToolUse event', async () => {
    const deps = makeMockDeps()
    setStdin(
      makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x', tool_name: 'Bash' }))
    )
    await makeHookCommand(deps)({})

    expect(deps.transcript.extractUsage).not.toHaveBeenCalled()
    expect(deps.transcript.detectSlashCommand).not.toHaveBeenCalled()
    expect(deps.transcript.extractMessages).not.toHaveBeenCalled()
  })

  it('exits 0 even when an unexpected error occurs', async () => {
    const deps = makeMockDeps({
      project: {
        find: vi.fn().mockImplementation(() => { throw new Error('unexpected failure') }),
        write: vi.fn(),
      },
    })
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await makeHookCommand(deps)({})
    expect(process.exit).toHaveBeenCalledWith(0)
  })
})
