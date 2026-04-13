import { homedir } from 'os'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { readConfig } from '../lib/config.js'
import { findProjectConfig } from '../lib/project.js'
import { extractUsageFromTranscript, detectSlashCommand, extractMessages } from '../lib/transcript.js'
import type { IngestEventPayload } from '@argos/shared'

interface HookStdinPayload {
  hook_event_name?: string
  session_id?: string
  agent_id?: string
  transcript_path?: string
  agent_transcript_path?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_response?: string
  exit_code?: number
}

/**
 * Read stdin with timeout
 * Returns null if stdin is TTY (user running manually) or if timeout expires
 */
async function readStdinWithTimeout(timeoutMs: number): Promise<string | null> {
  // If stdin is a TTY, return immediately (user ran command manually)
  if (process.stdin.isTTY) {
    return null
  }

  return new Promise((resolve) => {
    let data = ''
    let timeoutId: NodeJS.Timeout | null = null
    let completed = false

    const complete = (result: string | null) => {
      if (completed) return
      completed = true
      if (timeoutId) clearTimeout(timeoutId)
      process.stdin.removeAllListeners()
      resolve(result)
    }

    timeoutId = setTimeout(() => complete(null), timeoutMs)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })

    process.stdin.on('end', () => {
      complete(data || null)
    })

    process.stdin.on('error', () => {
      complete(null)
    })
  })
}

/**
 * Debug log - only writes if ARGOS_DEBUG=1
 */
function debugLog(message: unknown): void {
  if (process.env.ARGOS_DEBUG !== '1') return

  try {
    const argosDir = join(homedir(), '.argos')
    if (!existsSync(argosDir)) {
      mkdirSync(argosDir, { recursive: true })
    }

    const logPath = join(argosDir, 'hook-debug.log')
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${JSON.stringify(message, null, 2)}\n`
    appendFileSync(logPath, logMessage, 'utf8')
  } catch {
    // Ignore logging errors
  }
}

/**
 * Convert snake_case hook_event_name to SCREAMING_SNAKE_CASE EventType
 */
function convertEventType(hookEventName: string): string {
  // SessionStart -> SESSION_START
  // PreToolUse -> PRE_TOOL_USE
  // PostToolUse -> POST_TOOL_USE
  // Stop -> STOP
  // SubagentStop -> SUBAGENT_STOP
  return hookEventName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
}

/**
 * Build IngestEventPayload from hook stdin data
 */
function buildPayload(
  event: HookStdinPayload,
  project: { projectId: string; apiUrl: string },
  config: { userId: string }
): IngestEventPayload {
  const payload: IngestEventPayload = {
    projectId: project.projectId,
    sessionId: event.session_id || '',
    hookEventName: convertEventType(event.hook_event_name || '') as any,
  }

  // Add optional fields
  if (event.tool_name) {
    payload.toolName = event.tool_name
  }

  if (event.tool_input) {
    payload.toolInput = event.tool_input
  }

  if (event.tool_response) {
    // Truncate to 2000 characters
    payload.toolResponse = event.tool_response.slice(0, 2000)
  }

  if (event.exit_code !== undefined) {
    payload.exitCode = event.exit_code
  }

  if (event.agent_id) {
    payload.agentId = event.agent_id
  }

  return payload
}

/**
 * Hook command handler
 * This is called by Claude Code hooks via stdin
 * MUST always exit with code 0
 */
export async function hookCommand(): Promise<void> {
  try {
    // Read stdin with 100ms timeout
    const raw = await readStdinWithTimeout(100)
    if (!raw) {
      process.exit(0)
      return
    }

    // Parse hook event
    const event: HookStdinPayload = JSON.parse(raw)

    // Find project config
    const project = findProjectConfig(process.cwd())
    if (!project) {
      process.exit(0)
      return
    }

    // Read user config
    const config = readConfig()
    if (!config) {
      process.exit(0)
      return
    }

    // Build base payload
    const payload = buildPayload(event, project, config)

    // SessionStart: detect slash command
    if (event.hook_event_name === 'SessionStart' && event.transcript_path) {
      const slashSkill = await detectSlashCommand(event.transcript_path)
      if (slashSkill) {
        payload.isSlashCommand = true
      }
    }

    // Stop/SubagentStop: extract usage and messages from transcript
    if (event.hook_event_name === 'Stop' || event.hook_event_name === 'SubagentStop') {
      const transcriptPath = event.transcript_path || event.agent_transcript_path
      if (transcriptPath) {
        const usage = await extractUsageFromTranscript(transcriptPath)
        if (usage) {
          payload.usage = usage
        }

        const messages = await extractMessages(transcriptPath)
        if (messages.length > 0) {
          payload.messages = messages
        }
      }
    }

    // Send to API with 3 second hard timeout
    const apiUrl = project.apiUrl || config.apiUrl
    await fetch(`${apiUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    debugLog(err)
  } finally {
    // ALWAYS exit with 0 - never block Claude Code
    process.exit(0)
  }
}
