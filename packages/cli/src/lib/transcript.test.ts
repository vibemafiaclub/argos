import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readTranscriptLines,
  extractUsageFromTranscript,
  detectSlashCommand,
  extractMessages,
} from './transcript.js'

/** Write an array of objects as JSONL to a temp file and return the path. */
function writeJsonl(dir: string, lines: object[]): string {
  const path = join(dir, 'transcript.jsonl')
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  return path
}

// ---------------------------------------------------------------------------
// readTranscriptLines
// ---------------------------------------------------------------------------
describe('readTranscriptLines', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-rtl-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('파일이 없으면 빈 배열을 반환한다', async () => {
    const result = await readTranscriptLines(join(tempDir, 'nonexistent.jsonl'))
    expect(result).toEqual([])
  })

  it('각 줄을 JSON.parse하여 반환한다', async () => {
    const path = writeJsonl(tempDir, [
      { type: 'human', message: { content: [] } },
      { type: 'assistant', message: { usage: { input_tokens: 10 } } },
    ])

    const lines = await readTranscriptLines(path)
    expect(lines).toHaveLength(2)
    expect(lines[0].type).toBe('human')
    expect(lines[1].type).toBe('assistant')
  })

  it('파싱 실패한 줄은 {} 로 반환한다', async () => {
    const path = join(tempDir, 'bad.jsonl')
    writeFileSync(path, '{ invalid json\n{"type":"human"}', 'utf8')

    const lines = await readTranscriptLines(path)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({})
    expect(lines[1].type).toBe('human')
  })

  it('빈 줄은 제거한다', async () => {
    const path = join(tempDir, 'empty-lines.jsonl')
    writeFileSync(
      path,
      '{"type":"human"}\n\n{"type":"assistant"}\n',
      'utf8'
    )

    const lines = await readTranscriptLines(path)
    expect(lines).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// extractUsageFromTranscript
// ---------------------------------------------------------------------------
describe('extractUsageFromTranscript', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-usage-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('assistant 라인 여러 개의 토큰을 합산한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'assistant',
        message: {
          model: 'claude-3-5-sonnet',
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      {
        type: 'assistant',
        message: {
          model: 'claude-3-5-sonnet',
          usage: { input_tokens: 200, output_tokens: 80 },
        },
      },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).not.toBeNull()
    expect(result!.inputTokens).toBe(300)
    expect(result!.outputTokens).toBe(130)
  })

  it('assistant 라인이 없으면 null을 반환한다', async () => {
    const path = writeJsonl(tempDir, [
      { type: 'human', message: { content: [{ type: 'text', text: 'hello' }] } },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).toBeNull()
  })

  it('모든 토큰이 0이면 null을 반환한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'assistant',
        message: {
          model: 'claude-3-5-sonnet',
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).toBeNull()
  })

  it('첫 번째 assistant 라인의 model을 사용한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'assistant',
        message: { model: 'claude-3-opus', usage: { input_tokens: 10, output_tokens: 5 } },
      },
      {
        type: 'assistant',
        message: { model: 'claude-3-5-sonnet', usage: { input_tokens: 20, output_tokens: 10 } },
      },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).not.toBeNull()
    expect(result!.model).toBe('claude-3-opus')
  })

  it('cache 토큰(cache_creation_input_tokens, cache_read_input_tokens)을 올바르게 집계한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'assistant',
        message: {
          model: 'claude-3-5-sonnet',
          usage: {
            input_tokens: 50,
            output_tokens: 20,
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 100,
          },
        },
      },
      {
        type: 'assistant',
        message: {
          model: 'claude-3-5-sonnet',
          usage: {
            input_tokens: 50,
            output_tokens: 20,
            cache_creation_input_tokens: 200,
            cache_read_input_tokens: 400,
          },
        },
      },
    ])

    const result = await extractUsageFromTranscript(path)
    expect(result).not.toBeNull()
    expect(result!.cacheCreationTokens).toBe(500)
    expect(result!.cacheReadTokens).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// detectSlashCommand
// ---------------------------------------------------------------------------
describe('detectSlashCommand', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-slash-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('queue-operation 라인이 /로 시작하면 / 없이 반환한다', async () => {
    const path = writeJsonl(tempDir, [
      { type: 'queue-operation', content: '/review' },
    ])

    const result = await detectSlashCommand(path)
    expect(result).toBe('review')
  })

  it('queue-operation 라인이 없으면 null을 반환한다', async () => {
    const path = writeJsonl(tempDir, [
      { type: 'human', message: { content: [{ type: 'text', text: 'hi' }] } },
    ])

    const result = await detectSlashCommand(path)
    expect(result).toBeNull()
  })

  it('/로 시작하지 않는 queue-operation은 무시한다', async () => {
    const path = writeJsonl(tempDir, [
      { type: 'queue-operation', content: 'some-tool' },
    ])

    const result = await detectSlashCommand(path)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// extractMessages
// ---------------------------------------------------------------------------
describe('extractMessages', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'argos-msg-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('human/assistant 라인에서 text 블록을 추출한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'human',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-01T00:01:00.000Z',
        message: { content: [{ type: 'text', text: 'Hi there' }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('Hello')
    expect(result[1].content).toBe('Hi there')
  })

  it('text 블록이 없는 라인은 건너뛴다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'human',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'x' }] },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-01T00:01:00.000Z',
        message: { content: [{ type: 'text', text: 'response' }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('response')
  })

  it('50000자를 초과하는 텍스트는 잘린다', async () => {
    const longText = 'a'.repeat(60000)
    const path = writeJsonl(tempDir, [
      {
        type: 'human',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: { content: [{ type: 'text', text: longText }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result).toHaveLength(1)
    expect(result[0].content).toHaveLength(50000)
    expect(result[0].content).toBe('a'.repeat(50000))
  })

  it('sequence가 0부터 순서대로 증가한다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'human',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: { content: [{ type: 'text', text: 'msg1' }] },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-01T00:01:00.000Z',
        message: { content: [{ type: 'text', text: 'msg2' }] },
      },
      {
        type: 'human',
        timestamp: '2024-01-01T00:02:00.000Z',
        message: { content: [{ type: 'text', text: 'msg3' }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result[0].sequence).toBe(0)
    expect(result[1].sequence).toBe(1)
    expect(result[2].sequence).toBe(2)
  })

  it('role이 올바르게 HUMAN/ASSISTANT로 매핑된다', async () => {
    const path = writeJsonl(tempDir, [
      {
        type: 'human',
        timestamp: '2024-01-01T00:00:00.000Z',
        message: { content: [{ type: 'text', text: 'user message' }] },
      },
      {
        type: 'assistant',
        timestamp: '2024-01-01T00:01:00.000Z',
        message: { content: [{ type: 'text', text: 'assistant message' }] },
      },
    ])

    const result = await extractMessages(path)
    expect(result[0].role).toBe('HUMAN')
    expect(result[1].role).toBe('ASSISTANT')
  })
})
