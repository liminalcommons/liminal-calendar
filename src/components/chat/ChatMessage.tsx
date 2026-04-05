'use client'

import { toolCallLabel } from '@/lib/chat-tools'
import type { ChatMessage as ChatMessageType, ToolCall } from '@/lib/chat-tools'
import { Check, Loader2, Sparkles } from 'lucide-react'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

function ToolCallBadge({ toolCall, completed }: { toolCall: ToolCall; completed: boolean }) {
  const label = toolCallLabel(toolCall.function.name)
  const isImageGen = toolCall.function.name === 'generate_image'

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
      completed
        ? 'bg-grove-accent/10 text-grove-accent'
        : 'bg-grove-border/30 text-grove-text-muted'
    }`}>
      {completed ? (
        <Check size={10} />
      ) : isImageGen ? (
        <Sparkles size={10} className="animate-pulse" />
      ) : (
        <Loader2 size={10} className="animate-spin" />
      )}
      {label}
    </span>
  )
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (message.role === 'tool') return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-grove-accent-deep text-grove-surface'
          : 'bg-grove-surface border border-grove-border/30 text-grove-text'
      }`}>
        {message.content && (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}

        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.tool_calls.map((tc) => (
              <ToolCallBadge key={tc.id} toolCall={tc} completed={!isStreaming} />
            ))}
          </div>
        )}

        {isStreaming && !message.content && !message.tool_calls?.length && (
          <Loader2 size={14} className="animate-spin text-grove-text-muted" />
        )}
      </div>
    </div>
  )
}
