import { z } from 'zod'

const EventTypeEnum = z.enum(['SESSION_START', 'PRE_TOOL_USE', 'POST_TOOL_USE', 'STOP', 'SUBAGENT_STOP'])
const MessageRoleEnum = z.enum(['HUMAN', 'ASSISTANT'])

const UsagePayloadSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  model: z.string().optional(),
})

const MessagePayloadSchema = z.object({
  role: MessageRoleEnum,
  content: z.string(),
  sequence: z.number(),
  timestamp: z.string(),
})

export const IngestEventSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
  hookEventName: EventTypeEnum,
  toolName: z.string().optional(),
  toolInput: z.record(z.unknown()).optional(),
  toolResponse: z.string().optional(),
  exitCode: z.number().optional(),
  agentId: z.string().optional(),
  isSlashCommand: z.boolean().optional(),
  usage: UsagePayloadSchema.optional(),
  messages: z.array(MessagePayloadSchema).optional(),
})
