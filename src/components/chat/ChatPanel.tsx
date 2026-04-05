'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Sparkles, RotateCcw } from 'lucide-react'
import { ChatMessage } from './ChatMessage'
import { applyToolCall } from '@/lib/chat-tools'
import type { ChatMessage as ChatMessageType, EventFormValues, ToolCall } from '@/lib/chat-tools'

interface ChatPanelProps {
  formValues: EventFormValues
  onFormUpdate: (updates: Partial<EventFormValues>) => void
  storageKey: string
}

const GREETING = "Hi! I'm your event creation assistant. Describe the event you'd like to create and I'll help fill in the details."

export function ChatPanel({ formValues, onFormUpdate, storageKey }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Persist to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(messages))
    }
  }, [messages, storageKey])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage: ChatMessageType = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          formState: formValues,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Chat failed' }))
        throw new Error(err.error || 'Chat failed')
      }

      const data = await res.json()
      const assistantMsg: ChatMessageType = data.message

      // Apply pure tool calls to form
      if (assistantMsg.tool_calls) {
        for (const tc of assistantMsg.tool_calls) {
          const updates = applyToolCall(tc)
          if (updates) {
            onFormUpdate(updates)
          }

          // Handle image generation asynchronously — show in chat
          if (tc.function.name === 'generate_image') {
            const args = JSON.parse(tc.function.arguments)
            fetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: formValues.title || 'event', prompt: args.prompt }),
            })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(d => {
                if (d.url) {
                  // Add image message to chat
                  setMessages(prev => [...prev, {
                    role: 'assistant' as const,
                    content: null,
                    _imageUrl: d.url,
                  } as any])
                }
              })
              .catch(() => {
                setMessages(prev => [...prev, {
                  role: 'assistant' as const,
                  content: 'Image generation failed. You can try the AI Generate button on the form.',
                }])
              })
          }
        }
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: ChatMessageType = {
        role: 'assistant',
        content: `Sorry, something went wrong. ${err instanceof Error ? err.message : 'Please try again.'}`,
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, formValues, onFormUpdate])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full bg-grove-bg rounded-xl border border-grove-border/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-grove-border/20 bg-grove-surface/50">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-grove-accent" />
          <span className="text-sm font-medium text-grove-text">Event Assistant</span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              localStorage.removeItem(storageKey)
            }}
            className="p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            title="Reset conversation"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed bg-grove-surface border border-grove-border/30 text-grove-text">
              <p>{GREETING}</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            message={msg}
            onInsertImage={(url) => onFormUpdate({ imageUrl: url })}
          />
        ))}

        {isLoading && (
          <ChatMessage
            message={{ role: 'assistant', content: null }}
            isStreaming
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-grove-border/20 bg-grove-surface/30">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your event..."
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none text-sm bg-grove-surface border border-grove-border rounded-lg px-3 py-2
                       text-grove-text placeholder:text-grove-text-dim
                       focus:outline-none focus:ring-1 focus:ring-grove-accent
                       disabled:opacity-50 max-h-24"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="p-2 rounded-lg bg-grove-accent-deep text-grove-surface
                       hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
