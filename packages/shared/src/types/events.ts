export type EventType = 'SESSION_START' | 'PRE_TOOL_USE' | 'POST_TOOL_USE' | 'STOP' | 'SUBAGENT_STOP'
export type MessageRole = 'HUMAN' | 'ASSISTANT' | 'TOOL'

// 세션을 생성한 코딩 에이전트(출처). 미지정 시 CLAUDE 로 간주(후방호환).
export type AgentSource = 'CLAUDE' | 'CODEX'

export interface UsagePayload {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  model?: string
}

/** assistant 턴 1회분의 토큰 사용량 + 타임스탬프 */
export interface UsagePerTurnPayload extends UsagePayload {
  timestamp: string // ISO 8601 — transcript의 assistant 메시지 timestamp
}

export interface MessagePayload {
  role: MessageRole
  content: string   // HUMAN/ASSISTANT: text 블록, TOOL: tool_result 텍스트. 50,000자 truncation
  sequence: number  // 0-based
  timestamp: string // ISO 8601
  // TOOL role 전용 필드
  toolName?: string
  toolInput?: Record<string, unknown>
  toolUseId?: string
  durationMs?: number
}

// POST /api/events 성공(202) 응답 타입 — 기존 { ok: true }의 superset
export interface IngestEventResponse {
  ok: true
  project: {
    id: string
    orgId: string
    orgSlug: string
  }
}

// CLI가 POST /api/events로 전송하는 payload
export interface IngestEventPayload {
  sessionId: string
  projectId: string
  hookEventName: EventType
  agent?: AgentSource // 세션 출처(Claude Code / Codex). 미지정이면 서버가 CLAUDE 로 간주
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResponse?: string   // 2,000자 truncation
  toolUseId?: string      // PreToolUse/PostToolUse hook stdin의 tool_use_id — TOOL Message upsert 키
  exitCode?: number
  agentId?: string        // 서브에이전트 이벤트인 경우
  isSlashCommand?: boolean // SessionStart 이벤트 시 CLI가 transcript 파싱해서 설정
  // Stop/SubagentStop에서 CLI가 transcript에서 추출해서 채워 보냄
  usage?: UsagePayload               // 기존 — 전체 합산 (하위호환)
  usagePerTurn?: UsagePerTurnPayload[] // 신규 — assistant 턴별 개별 usage
  messages?: MessagePayload[]
  // Stop에서 transcript의 type="summary" 라인으로부터 추출 (없으면 undefined)
  title?: string    // 500자 이내
  summary?: string  // 10,000자 이내
}
