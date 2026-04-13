export type EventType = 'SESSION_START' | 'PRE_TOOL_USE' | 'POST_TOOL_USE' | 'STOP' | 'SUBAGENT_STOP'
export type MessageRole = 'HUMAN' | 'ASSISTANT'

export interface UsagePayload {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  model?: string
}

export interface MessagePayload {
  role: MessageRole
  content: string   // text 블록만, 50,000자 truncation
  sequence: number  // 0-based
  timestamp: string // ISO 8601
}

// CLI가 POST /api/events로 전송하는 payload
export interface IngestEventPayload {
  sessionId: string
  projectId: string
  hookEventName: EventType
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResponse?: string   // 2,000자 truncation
  exitCode?: number
  agentId?: string        // 서브에이전트 이벤트인 경우
  isSlashCommand?: boolean // SessionStart 이벤트 시 CLI가 transcript 파싱해서 설정
  // Stop/SubagentStop에서 CLI가 transcript에서 추출해서 채워 보냄
  usage?: UsagePayload
  messages?: MessagePayload[]
}
