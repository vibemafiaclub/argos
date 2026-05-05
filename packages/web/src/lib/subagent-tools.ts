const SUBAGENT_TOOL_NAMES = new Set(['Agent', 'Task'])

export function getSubagentType(
  toolName: string | null | undefined,
  input: Record<string, unknown> | null | undefined,
): string | null {
  if (!toolName || !SUBAGENT_TOOL_NAMES.has(toolName) || !input) return null

  const subagentType = input['subagent_type']
  if (typeof subagentType !== 'string') return null

  const trimmed = subagentType.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getSubagentDescription(
  toolName: string | null | undefined,
  input: Record<string, unknown> | null | undefined,
): string | null {
  if (getSubagentType(toolName, input) === null || !input) return null

  const description = input['description']
  if (typeof description !== 'string') return null

  const trimmed = description.trim()
  return trimmed.length > 0 ? trimmed : null
}
