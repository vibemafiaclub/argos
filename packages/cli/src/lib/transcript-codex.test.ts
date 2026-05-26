import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  extractUsageFromCodexTranscript,
  extractUsagePerTurnFromCodexTranscript,
  extractMessagesFromCodexTranscript,
} from './transcript-codex.js'

// 실제 Codex rollout 라인 구조를 본뜬 합성 fixture (docs/codex-integration.md §3 기준).
const FIXTURE = [
  { timestamp: '2026-05-26T00:00:00.000Z', type: 'session_meta', payload: { id: 'sess', cwd: '/x', cli_version: '0.133.0', model_provider: 'openai' } },
  { timestamp: '2026-05-26T00:00:01.000Z', type: 'turn_context', payload: { turn_id: 't1', cwd: '/x', model: 'gpt-5.5' } },
  { timestamp: '2026-05-26T00:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: '적절히 commit push한거 맞아?' } },
  { timestamp: '2026-05-26T00:00:03.000Z', type: 'event_msg', payload: { type: 'agent_message', message: 'Checking git status first.' } },
  { timestamp: '2026-05-26T00:00:04.000Z', type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: '{"cmd":"git status"}', call_id: 'call_1' } },
  { timestamp: '2026-05-26T00:00:05.500Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'call_1', output: 'clean' } },
  { timestamp: '2026-05-26T00:00:06.000Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch', call_id: 'call_2' } },
  { timestamp: '2026-05-26T00:00:06.200Z', type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call_2', output: 'Success.' } },
  // 누적 token_count 2개: total 은 누적, last 는 턴 델타
  { timestamp: '2026-05-26T00:00:03.500Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 14839, cached_input_tokens: 4480, output_tokens: 348, reasoning_output_tokens: 95, total_tokens: 15187 }, last_token_usage: { input_tokens: 14839, cached_input_tokens: 4480, output_tokens: 348, reasoning_output_tokens: 95, total_tokens: 15187 } } } },
  { timestamp: '2026-05-26T00:00:07.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 33123, cached_input_tokens: 19200, output_tokens: 477, reasoning_output_tokens: 95, total_tokens: 33600 }, last_token_usage: { input_tokens: 18284, cached_input_tokens: 14720, output_tokens: 129, reasoning_output_tokens: 0, total_tokens: 18413 } } } },
]

describe('transcript-codex', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'argos-codex-tr-'))
    path = join(dir, 'rollout.jsonl')
    writeFileSync(path, FIXTURE.map((l) => JSON.stringify(l)).join('\n'), 'utf8')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('extractUsage: 마지막 token_count 의 total 을 Claude 컨벤션으로 매핑', async () => {
    const u = await extractUsageFromCodexTranscript(path)
    expect(u).not.toBeNull()
    // input(33123) - cached(19200) = 13923
    expect(u!.inputTokens).toBe(13923)
    expect(u!.cacheReadTokens).toBe(19200)
    expect(u!.cacheCreationTokens).toBe(0)
    expect(u!.outputTokens).toBe(477)
    expect(u!.model).toBe('gpt-5.5')
  })

  it('extractUsage: token_count 가 없으면 null', async () => {
    const empty = join(dir, 'empty.jsonl')
    writeFileSync(empty, JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.5' } }), 'utf8')
    expect(await extractUsageFromCodexTranscript(empty)).toBeNull()
  })

  it('extractUsagePerTurn: token_count 마다 last_token_usage 1개', async () => {
    const turns = await extractUsagePerTurnFromCodexTranscript(path)
    expect(turns).toHaveLength(2)
    expect(turns[0].inputTokens).toBe(14839 - 4480)
    expect(turns[1].inputTokens).toBe(18284 - 14720)
    expect(turns[1].cacheReadTokens).toBe(14720)
    expect(turns[0].model).toBe('gpt-5.5')
    expect(turns[0].timestamp).toBe('2026-05-26T00:00:03.500Z')
  })

  it('extractMessages: HUMAN/ASSISTANT/TOOL 매핑 + 결과 backfill', async () => {
    const msgs = await extractMessagesFromCodexTranscript(path)
    const byRole = msgs.reduce<Record<string, number>>((a, m) => { a[m.role] = (a[m.role] || 0) + 1; return a }, {})
    expect(byRole).toEqual({ HUMAN: 1, ASSISTANT: 1, TOOL: 2 })

    const human = msgs.find((m) => m.role === 'HUMAN')!
    expect(human.content).toBe('적절히 commit push한거 맞아?')

    const exec = msgs.find((m) => m.toolName === 'exec_command')!
    expect(exec.toolInput).toEqual({ cmd: 'git status' }) // arguments JSON 파싱
    expect(exec.content).toBe('clean') // function_call_output backfill
    expect(exec.durationMs).toBe(1500) // 00:05.500 - 00:04.000

    const patch = msgs.find((m) => m.toolName === 'apply_patch')!
    expect(patch.toolInput).toEqual({ input: '*** Begin Patch' }) // raw input
    expect(patch.content).toBe('Success.')
  })

  it('존재하지 않는 파일 → null / []', async () => {
    expect(await extractUsageFromCodexTranscript('/no/such/file.jsonl')).toBeNull()
    expect(await extractMessagesFromCodexTranscript('/no/such/file.jsonl')).toEqual([])
  })
})
