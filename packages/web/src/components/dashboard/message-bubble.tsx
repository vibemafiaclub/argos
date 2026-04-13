'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'

interface MessageBubbleProps {
  role: 'HUMAN' | 'ASSISTANT'
  content: string
  timestamp: string
}

function renderContent(content: string, isExpanded: boolean) {
  const MAX_LENGTH = 500
  const shouldTruncate = content.length > MAX_LENGTH && !isExpanded
  const displayContent = shouldTruncate ? content.slice(0, MAX_LENGTH) : content

  // Simple code block detection using regex
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = []
  let lastIndex = 0
  let match

  while ((match = codeBlockRegex.exec(displayContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: displayContent.slice(lastIndex, match.index),
      })
    }
    parts.push({
      type: 'code',
      content: match[2],
      language: match[1] || 'text',
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < displayContent.length) {
    parts.push({
      type: 'text',
      content: displayContent.slice(lastIndex),
    })
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', content: displayContent })
  }

  return (
    <>
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return (
            <pre
              key={idx}
              className="bg-gray-900 text-gray-100 p-3 rounded mt-2 mb-2 overflow-x-auto text-sm"
            >
              <code>{part.content}</code>
            </pre>
          )
        }
        return (
          <div key={idx} className="whitespace-pre-wrap break-words">
            {part.content}
          </div>
        )
      })}
      {shouldTruncate && <span className="text-gray-500">...</span>}
    </>
  )
}

export function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLong = content.length > 500

  return (
    <div className={`flex ${role === 'HUMAN' ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-lg p-4 ${
          role === 'HUMAN' ? 'bg-gray-100 text-gray-900' : 'bg-blue-50 text-gray-900'
        }`}
      >
        <div className="text-xs text-gray-600 mb-2 font-medium">
          {role === 'HUMAN' ? 'You' : 'Claude'} • {formatDate(timestamp)}
        </div>
        {renderContent(content, isExpanded)}
        {isLong && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs"
          >
            {isExpanded ? '접기' : '더 보기'}
          </Button>
        )}
      </div>
    </div>
  )
}
