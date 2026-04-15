import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  extractUsageFromTranscript,
  detectSlashCommand,
  extractMessages,
} from '../lib/transcript.js'

function writejsonl(dir: string, lines: object[]): string {
  const path = join(dir, 'transcript.jsonl')
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  return path
}

describe('extractUsageFromTranscript', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns null for a non-existent file', async () => {
    const result = await extractUsageFromTranscript(join(tempDir, 'no-file.jsonl'))
    expect(result).toBeNull()
  })

  it('sums tokens across multiple assistant messages', async () => {
    const path = writejsonl(tempDir, [
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet',
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 10, cache_read_input_tokens: 20 },
        },
      },
      { type: 'human', message: { content: [{ type: 'text', text: 'hi' }] } },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet',
          usage: { input_tokens: 200, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 5 },
        },
      },
    ])

    const result = await extractUsageFromTranscript(path)

    expect(result).not.toBeNull()
    expect(result!.inputTokens).toBe(300)
    expect(result!.outputTokens).toBe(130)
    expect(result!.cacheCreationTokens).toBe(10)
    expect(result!.cacheReadTokens).toBe(25)
  })

  it('picks model from the first assistant message', async () => {
    const path = writejsonl(tempDir, [
      { type: 'assistant', message: { model: 'claude-opus', usage: { input_tokens: 10, output_tokens: 5 } } },
      { type: 'assistant', message: { model: 'claude-sonnet', usage: { input_tokens: 10, output_tokens: 5 } } },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result!.model).toBe('claude-opus')
  })

  it('returns null when all token counts are zero', async () => {
    const path = writejsonl(tempDir, [
      { type: 'assistant', message: { usage: { input_tokens: 0, output_tokens: 0 } } },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).toBeNull()
  })

  it('ignores non-assistant lines for token counting', async () => {
    const path = writejsonl(tempDir, [
      { type: 'human', message: { usage: { input_tokens: 9999 } } },
      { type: 'system', message: { usage: { input_tokens: 8888 } } },
      { type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 50 } } },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result!.inputTokens).toBe(100)
    expect(result!.outputTokens).toBe(50)
  })

  it('handles malformed lines without throwing', async () => {
    const path = join(tempDir, 'transcript.jsonl')
    writeFileSync(
      path,
      [
        '{ not valid json',
        JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 50, output_tokens: 20 } } }),
      ].join('\n'),
      'utf8'
    )

    const result = await extractUsageFromTranscript(path)
    expect(result!.inputTokens).toBe(50)
  })
})

describe('detectSlashCommand', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns null when no slash command is present', async () => {
    const path = writejsonl(tempDir, [{ type: 'human', content: 'regular message' }])
    expect(await detectSlashCommand(path)).toBeNull()
  })

  it('returns null for non-existent file', async () => {
    expect(await detectSlashCommand(join(tempDir, 'nope.jsonl'))).toBeNull()
  })

  it('returns skill name without the leading slash', async () => {
    const path = writejsonl(tempDir, [{ type: 'queue-operation', content: '/commit' }])
    expect(await detectSlashCommand(path)).toBe('commit')
  })

  it('detects slash command within a mixed transcript', async () => {
    const path = writejsonl(tempDir, [
      { type: 'human', content: 'do something' },
      { type: 'queue-operation', content: '/review-pr' },
      { type: 'assistant', message: {} },
    ])
    expect(await detectSlashCommand(path)).toBe('review-pr')
  })

  it('ignores queue-operation entries that do not start with slash', async () => {
    const path = writejsonl(tempDir, [
      { type: 'queue-operation', content: 'not a slash command' },
    ])
    expect(await detectSlashCommand(path)).toBeNull()
  })

  it('returns only the first slash command when multiple exist', async () => {
    const path = writejsonl(tempDir, [
      { type: 'queue-operation', content: '/first' },
      { type: 'queue-operation', content: '/second' },
    ])
    expect(await detectSlashCommand(path)).toBe('first')
  })
})

describe('extractMessages', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns empty array for non-existent file', async () => {
    const result = await extractMessages(join(tempDir, 'nope.jsonl'))
    expect(result).toEqual([])
  })

  it('extracts human and assistant messages with correct roles', async () => {
    const path = writejsonl(tempDir, [
      {
        type: 'human',
        message: { content: [{ type: 'text', text: 'Hello' }] },
        timestamp: '2024-01-01T00:00:00Z',
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'World' }] },
        timestamp: '2024-01-01T00:00:01Z',
      },
    ])

    const result = await extractMessages(path)

    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('HUMAN')
    expect(result[0].content).toBe('Hello')
    expect(result[0].sequence).toBe(0)
    expect(result[1].role).toBe('ASSISTANT')
    expect(result[1].content).toBe('World')
    expect(result[1].sequence).toBe(1)
  })

  it('skips non-text content blocks (tool_use, tool_result)', async () => {
    const path = writejsonl(tempDir, [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool1' },
            { type: 'text', text: 'I will help you' },
          ],
        },
      },
    ])

    const result = await extractMessages(path)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('I will help you')
  })

  it('skips messages that have no text blocks at all', async () => {
    const path = writejsonl(tempDir, [
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x' }] } },
    ])

    const result = await extractMessages(path)
    expect(result).toHaveLength(0)
  })

  it('truncates content to 50,000 characters', async () => {
    const path = writejsonl(tempDir, [
      {
        type: 'human',
        message: { content: [{ type: 'text', text: 'a'.repeat(60000) }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result[0].content.length).toBe(50000)
  })

  it('assigns sequential sequence numbers', async () => {
    const path = writejsonl(tempDir, [
      { type: 'human', message: { content: [{ type: 'text', text: 'msg1' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'msg2' }] } },
      { type: 'human', message: { content: [{ type: 'text', text: 'msg3' }] } },
    ])

    const result = await extractMessages(path)
    expect(result.map((m) => m.sequence)).toEqual([0, 1, 2])
  })

  it('joins multiple text blocks within one message', async () => {
    const path = writejsonl(tempDir, [
      {
        type: 'human',
        message: {
          content: [
            { type: 'text', text: 'part one' },
            { type: 'text', text: 'part two' },
          ],
        },
      },
    ])

    const result = await extractMessages(path)
    expect(result[0].content).toBe('part one\npart two')
  })
})
