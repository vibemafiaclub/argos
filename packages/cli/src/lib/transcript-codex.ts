import { readFileSync, existsSync } from 'fs'
import type { UsagePayload, UsagePerTurnPayload, MessagePayload } from '@argos/shared'

/**
 * Codex rollout(transcript) 파서.
 *
 * Claude Code 의 transcript.ts 와 달리, Codex 의 세션 파일은
 * `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` 에 저장되며 라인 구조가 완전히 다르다.
 *   - { type:"session_meta", payload:{…} }
 *   - { type:"turn_context",  payload:{ turn_id, model, … } }
 *   - { type:"event_msg",     payload:{ type:"token_count"|"user_message"|"agent_message"|…, … } }
 *   - { type:"response_item", payload:{ type:"message"|"function_call"|"function_call_output"|"custom_tool_call"|…, … } }
 *
 * 토큰 사용량은 event_msg/token_count, 대화 텍스트는 event_msg/user_message·agent_message,
 * 툴 호출은 response_item/function_call·custom_tool_call 에서 추출한다.
 * 자세한 매핑 근거는 docs/codex-integration.md §3 참고.
 *
 * ⚠️ 공식 문서가 "transcript 포맷은 안정적 인터페이스가 아니며 바뀔 수 있다"고 명시하므로,
 *    파싱 실패 시 throw 하지 않고 null/[] 을 반환해 hook 이 부분 데이터라도 전송하도록 한다.
 */

interface CodexTokenUsage {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
  total_tokens?: number
}

interface RolloutLine {
  timestamp?: string
  type?: string
  payload?: {
    type?: string
    model?: string
    message?: string // event_msg user_message/agent_message
    role?: string // response_item message
    content?: Array<{ type?: string; text?: string }>
    // token_count
    info?: { total_token_usage?: CodexTokenUsage; last_token_usage?: CodexTokenUsage }
    // function_call / custom_tool_call
    name?: string
    arguments?: string // function_call: JSON string
    input?: string // custom_tool_call: raw string (e.g. apply_patch)
    call_id?: string
    output?: string // *_output
  }
}

function readRolloutLines(path: string): RolloutLine[] {
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf8')
    return content
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as RolloutLine
        } catch {
          return {}
        }
      })
  } catch {
    return []
  }
}

/**
 * Codex 토큰 사용량 → argos UsagePayload.
 *
 * Codex 의 `input_tokens` 는 cached 를 **포함**하므로(§3.3), Claude 컨벤션에 맞춰
 *   inputTokens     = input_tokens − cached_input_tokens (비캐시 입력)
 *   cacheReadTokens = cached_input_tokens
 *   cacheCreationTokens = 0 (OpenAI 는 cache-write 개념 없음)
 *   outputTokens    = output_tokens (reasoning 토큰 이미 포함)
 * total_token_usage 는 세션 누적이므로 **마지막 token_count** 를 세션 총합으로 사용한다.
 */
export async function extractUsageFromCodexTranscript(path: string): Promise<UsagePayload | null> {
  const lines = readRolloutLines(path)
  let lastTotal: CodexTokenUsage | undefined
  let model: string | undefined

  for (const line of lines) {
    const p = line.payload
    if (!p) continue
    if (!model && line.type === 'turn_context' && p.model) model = p.model
    if (!model && line.type === 'session_meta' && p.model) model = p.model
    if (line.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
      lastTotal = p.info.total_token_usage
    }
  }

  if (!lastTotal) return null

  return toUsagePayload(lastTotal, model)
}

/**
 * 턴별 사용량. token_count 이벤트마다 `last_token_usage`(해당 턴 델타)를 한 항목으로.
 */
export async function extractUsagePerTurnFromCodexTranscript(
  path: string
): Promise<UsagePerTurnPayload[]> {
  const lines = readRolloutLines(path)
  const results: UsagePerTurnPayload[] = []
  let model: string | undefined

  for (const line of lines) {
    const p = line.payload
    if (!p) continue
    if (!model && line.type === 'turn_context' && p.model) model = p.model
    if (line.type === 'event_msg' && p.type === 'token_count' && p.info?.last_token_usage) {
      const u = toUsagePayload(p.info.last_token_usage, model)
      results.push({ ...u, timestamp: line.timestamp || new Date().toISOString() })
    }
  }

  return results
}

function toUsagePayload(u: CodexTokenUsage, model?: string): UsagePayload {
  const input = u.input_tokens || 0
  const cached = u.cached_input_tokens || 0
  return {
    inputTokens: Math.max(0, input - cached),
    outputTokens: u.output_tokens || 0,
    cacheCreationTokens: 0,
    cacheReadTokens: cached,
    model,
  }
}

/**
 * HUMAN/ASSISTANT/TOOL 메시지 추출.
 *  - event_msg user_message  → HUMAN  (사용자가 실제 입력한 프롬프트; developer/주입 컨텍스트 제외)
 *  - event_msg agent_message → ASSISTANT
 *  - response_item function_call / custom_tool_call → TOOL (name, input)
 *  - response_item *_output → 매칭되는 TOOL 의 content/durationMs backfill (call_id 기준)
 *
 * sequence 는 rollout 순서대로 부여(best-effort) — API 측에서 재정렬될 수 있다.
 */
export async function extractMessagesFromCodexTranscript(path: string): Promise<MessagePayload[]> {
  const lines = readRolloutLines(path)
  const messages: MessagePayload[] = []
  const toolByCallId = new Map<string, MessagePayload>()
  let sequence = 0

  for (const line of lines) {
    const p = line.payload
    if (!p) continue
    const timestamp = line.timestamp || new Date().toISOString()

    if (line.type === 'event_msg') {
      if (p.type === 'user_message' && typeof p.message === 'string' && p.message.length > 0) {
        messages.push({ role: 'HUMAN', content: p.message.slice(0, 50000), sequence: sequence++, timestamp })
      } else if (p.type === 'agent_message' && typeof p.message === 'string' && p.message.length > 0) {
        messages.push({ role: 'ASSISTANT', content: p.message.slice(0, 50000), sequence: sequence++, timestamp })
      }
      continue
    }

    if (line.type === 'response_item') {
      // 툴 호출 (function_call = JSON arguments, custom_tool_call = raw input)
      if ((p.type === 'function_call' || p.type === 'custom_tool_call') && p.name) {
        const tool: MessagePayload = {
          role: 'TOOL',
          content: '',
          sequence: sequence++,
          timestamp,
          toolName: p.name,
          toolInput: parseToolInput(p),
          toolUseId: p.call_id,
        }
        messages.push(tool)
        if (p.call_id) toolByCallId.set(p.call_id, tool)
        continue
      }
      // 툴 결과 → 매칭 TOOL backfill
      if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && p.call_id) {
        const tool = toolByCallId.get(p.call_id)
        if (tool && typeof p.output === 'string') {
          tool.content = p.output.slice(0, 50000)
          const startMs = Date.parse(tool.timestamp)
          const endMs = Date.parse(timestamp)
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
            tool.durationMs = Math.max(0, endMs - startMs)
          }
        }
      }
    }
  }

  return messages
}

function parseToolInput(p: NonNullable<RolloutLine['payload']>): Record<string, unknown> {
  // function_call: arguments 는 JSON 문자열
  if (typeof p.arguments === 'string') {
    try {
      const parsed = JSON.parse(p.arguments)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      // fall through
    }
    return { arguments: p.arguments }
  }
  // custom_tool_call: input 은 raw 문자열(apply_patch 등)
  if (typeof p.input === 'string') return { input: p.input }
  return {}
}
