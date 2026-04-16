import { readFileSync, existsSync } from 'fs'
import type { UsagePayload, UsagePerTurnPayload, MessagePayload } from '@argos/shared'

interface ContentBlock {
  type?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
}

interface TranscriptLine {
  type?: string
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    model?: string
    content?: string | ContentBlock[]
  }
  content?: string
  timestamp?: string
}

/**
 * Read transcript.jsonl file and parse each line
 */
export async function readTranscriptLines(path: string): Promise<TranscriptLine[]> {
  if (!existsSync(path)) {
    return []
  }

  try {
    const content = readFileSync(path, 'utf8')
    const lines = content.split('\n').filter((line) => line.trim())

    return lines.map((line) => {
      try {
        return JSON.parse(line) as TranscriptLine
      } catch {
        return {}
      }
    })
  } catch {
    return []
  }
}

/**
 * Extract usage information from transcript (Stop/SubagentStop events)
 * Sums up all usage from type==="assistant" entries
 */
export async function extractUsageFromTranscript(
  transcriptPath: string
): Promise<UsagePayload | null> {
  const lines = await readTranscriptLines(transcriptPath)

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheCreationTokens = 0
  let totalCacheReadTokens = 0
  let model: string | undefined

  for (const line of lines) {
    if (line.type === 'assistant' && line.message?.usage) {
      const usage = line.message.usage
      totalInputTokens += usage.input_tokens || 0
      totalOutputTokens += usage.output_tokens || 0
      totalCacheCreationTokens += usage.cache_creation_input_tokens || 0
      totalCacheReadTokens += usage.cache_read_input_tokens || 0

      // Get model from first assistant message
      if (!model && line.message.model) {
        model = line.message.model
      }
    }
  }

  if (
    totalInputTokens === 0 &&
    totalOutputTokens === 0 &&
    totalCacheCreationTokens === 0 &&
    totalCacheReadTokens === 0
  ) {
    return null
  }

  return {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheCreationTokens: totalCacheCreationTokens,
    cacheReadTokens: totalCacheReadTokens,
    model,
  }
}

/**
 * Extract per-assistant-turn usage from transcript.
 * Returns one UsagePerTurnPayload per "assistant" entry in transcript.jsonl.
 * Each entry's timestamp comes from the transcript line's timestamp field.
 */
export async function extractUsagePerTurn(
  transcriptPath: string
): Promise<UsagePerTurnPayload[]> {
  const lines = await readTranscriptLines(transcriptPath)
  const results: UsagePerTurnPayload[] = []

  for (const line of lines) {
    if (line.type === 'assistant' && line.message?.usage) {
      const usage = line.message.usage
      results.push({
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        model: line.message.model,
        timestamp: line.timestamp || new Date().toISOString(),
      })
    }
  }

  return results
}

/**
 * Detect slash command from SessionStart transcript
 * Looks for queue-operation entry with content starting with '/'
 * Returns the skill name without the '/' prefix
 */
export async function detectSlashCommand(transcriptPath: string): Promise<string | null> {
  const lines = await readTranscriptLines(transcriptPath)

  const queueOp = lines.find(
    (l) =>
      l.type === 'queue-operation' &&
      typeof l.content === 'string' &&
      l.content.startsWith('/')
  )

  if (!queueOp || typeof queueOp.content !== 'string') {
    return null
  }

  // Remove leading '/' and return skill name
  return queueOp.content.slice(1)
}

/**
 * Format a tool_use block as a readable string
 */
function formatToolUse(block: ContentBlock): string {
  const name = block.name || 'unknown'
  const input = block.input || {}
  return `[Tool: ${name}] ${JSON.stringify(input)}`
}

/**
 * Extract all HUMAN/ASSISTANT messages from transcript
 * Returns array of MessagePayload (text + tool_use blocks, 50k truncation)
 *
 * Claude Code transcript uses type="user" for human messages (also supports legacy "human").
 * User message content can be a plain string or an array of content blocks.
 * Array-content user entries (tool_result) are skipped — only actual user text is captured.
 */
export async function extractMessages(transcriptPath: string): Promise<MessagePayload[]> {
  const lines = await readTranscriptLines(transcriptPath)
  const messages: MessagePayload[] = []
  let sequence = 0

  for (const line of lines) {
    const isUser = line.type === 'user' || line.type === 'human'
    const isAssistant = line.type === 'assistant'
    if (!isUser && !isAssistant) continue

    const role = isUser ? 'HUMAN' : 'ASSISTANT'
    const content = line.message?.content

    // User messages: content can be a plain string
    if (isUser) {
      if (typeof content === 'string' && content.length > 0) {
        messages.push({
          role: 'HUMAN',
          content: content.slice(0, 50000),
          sequence: sequence++,
          timestamp: line.timestamp || new Date().toISOString(),
        })
      }
      // Array content (tool_result blocks) — skip, not actual user input
      continue
    }

    // Assistant messages: content is an array of content blocks
    if (!Array.isArray(content)) continue

    const parts: string[] = []
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text)
      } else if (block.type === 'tool_use' && block.name) {
        parts.push(formatToolUse(block))
      }
    }

    if (parts.length > 0) {
      const fullText = parts.join('\n')
      messages.push({
        role: 'ASSISTANT',
        content: fullText.slice(0, 50000),
        sequence: sequence++,
        timestamp: line.timestamp || new Date().toISOString(),
      })
    }
  }

  return messages
}
