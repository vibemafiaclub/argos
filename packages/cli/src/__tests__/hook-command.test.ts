import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'stream'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// --- module mocks (hoisted before imports) ---
vi.mock('../lib/config.js', () => ({
  readConfig: vi.fn(),
}))
vi.mock('../lib/project.js', () => ({
  findProjectConfig: vi.fn(),
}))
vi.mock('../lib/transcript.js', () => ({
  extractUsageFromTranscript: vi.fn(),
  detectSlashCommand: vi.fn(),
  extractMessages: vi.fn(),
}))
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}))

import { convertEventType, buildPayload, hookCommand } from '../commands/hook.js'
import { readConfig } from '../lib/config.js'
import { findProjectConfig } from '../lib/project.js'
import {
  extractUsageFromTranscript,
  detectSlashCommand,
  extractMessages,
} from '../lib/transcript.js'
import { spawn } from 'child_process'

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
// hookCommand — orchestration
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

describe('hookCommand orchestration', () => {
  let originalStdin: NodeJS.ReadStream
  let tempDir: string

  beforeEach(() => {
    originalStdin = process.stdin
    tempDir = mkdtempSync(join(tmpdir(), 'argos-hook-test-'))

    vi.mocked(readConfig).mockReturnValue(MOCK_CONFIG)
    vi.mocked(findProjectConfig).mockReturnValue(MOCK_PROJECT)
    vi.mocked(extractUsageFromTranscript).mockResolvedValue(null)
    vi.mocked(detectSlashCommand).mockResolvedValue(null)
    vi.mocked(extractMessages).mockResolvedValue([])

    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
  })

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true })
    rmSync(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('always exits with code 0', async () => {
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x' })))
    await hookCommand()
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('exits 0 immediately when stdin has no data', async () => {
    const emptyStream = new Readable({ read() {} })
    emptyStream.push(null)
    setStdin(emptyStream)

    await hookCommand()
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('exits 0 immediately when project config is missing', async () => {
    vi.mocked(findProjectConfig).mockReturnValue(null)
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await hookCommand()
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('exits 0 immediately when user config is missing', async () => {
    vi.mocked(readConfig).mockReturnValue(null)
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await hookCommand()
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(spawn).not.toHaveBeenCalled()
  })

  it('spawns background process for a valid event', async () => {
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x' })))
    await hookCommand()
    expect(spawn).toHaveBeenCalled()
  })

  it('calls extractUsageFromTranscript and extractMessages for Stop event', async () => {
    const transcriptPath = join(tempDir, 'transcript.jsonl')
    writeFileSync(transcriptPath, '', 'utf8')

    setStdin(
      makeStdin(
        JSON.stringify({ hook_event_name: 'Stop', session_id: 'x', transcript_path: transcriptPath })
      )
    )
    await hookCommand()

    expect(extractUsageFromTranscript).toHaveBeenCalledWith(transcriptPath)
    expect(extractMessages).toHaveBeenCalledWith(transcriptPath)
  })

  it('calls extractUsageFromTranscript and extractMessages for SubagentStop event', async () => {
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
    await hookCommand()

    expect(extractUsageFromTranscript).toHaveBeenCalledWith(transcriptPath)
    expect(extractMessages).toHaveBeenCalledWith(transcriptPath)
  })

  it('calls detectSlashCommand for SessionStart event', async () => {
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
    await hookCommand()

    expect(detectSlashCommand).toHaveBeenCalledWith(transcriptPath)
    expect(extractUsageFromTranscript).not.toHaveBeenCalled()
  })

  it('does NOT call transcript functions for PreToolUse event', async () => {
    setStdin(
      makeStdin(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'x', tool_name: 'Bash' }))
    )
    await hookCommand()

    expect(extractUsageFromTranscript).not.toHaveBeenCalled()
    expect(detectSlashCommand).not.toHaveBeenCalled()
    expect(extractMessages).not.toHaveBeenCalled()
  })

  it('exits 0 even when an unexpected error occurs', async () => {
    vi.mocked(findProjectConfig).mockImplementation(() => {
      throw new Error('unexpected failure')
    })
    setStdin(makeStdin(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' })))

    await hookCommand()
    expect(process.exit).toHaveBeenCalledWith(0)
  })
})
