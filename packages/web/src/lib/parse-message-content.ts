export type MessageContentSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language?: string }

export function parseMessageContent(content: string): MessageContentSegment[] {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const parts: MessageContentSegment[] = []
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      })
    }
    parts.push({
      type: 'code',
      content: match[2],
      language: match[1] || 'text',
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content })
  }

  return parts
}
