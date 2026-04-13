import { readFileSync, existsSync } from 'fs'
import type { UsagePayload, MessagePayload } from '@argos/shared'

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
    content?: Array<{ type?: string; text?: string }>
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
 * Extract all HUMAN/ASSISTANT messages from transcript
 * Returns array of MessagePayload (text blocks only, 50k truncation)
 */
export async function extractMessages(transcriptPath: string): Promise<MessagePayload[]> {
  const lines = await readTranscriptLines(transcriptPath)
  const messages: MessagePayload[] = []
  let sequence = 0

  for (const line of lines) {
    if (line.type === 'human' || line.type === 'assistant') {
      const role = line.type === 'human' ? 'HUMAN' : 'ASSISTANT'
      const content = line.message?.content || []

      // Extract text blocks only
      const textBlocks = content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text || '')

      if (textBlocks.length > 0) {
        const fullText = textBlocks.join('\n')
        // Truncate to 50,000 characters
        const truncatedText = fullText.slice(0, 50000)

        messages.push({
          role,
          content: truncatedText,
          sequence: sequence++,
          timestamp: line.timestamp || new Date().toISOString(),
        })
      }
    }
  }

  return messages
}
