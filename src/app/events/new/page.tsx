'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { EventForm } from '@/components/events/EventForm'
import { ChatPanel } from '@/components/chat/ChatPanel'
import type { EventFormValues } from '@/lib/chat-tools'

export default function NewEventPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [externalValues, setExternalValues] = useState<Partial<EventFormValues>>({})

  const handleFormUpdate = useCallback((updates: Partial<EventFormValues>) => {
    setExternalValues(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSuccess = useCallback(() => {
    localStorage.removeItem('calendar-chat-new')
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-grove-bg">
        <NavBar />
        <div className="flex items-center justify-center py-20">
          <p className="text-grove-text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-4 transition-colors"
        >
          &larr; Back
        </button>

        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 'calc(100vh - 160px)' }}>
          {/* Left: Chat Panel */}
          <div className="w-full lg:w-1/2 lg:min-h-0">
            <div className="lg:sticky lg:top-4 h-[400px] lg:h-[calc(100vh-180px)]">
              <ChatPanel
                formValues={externalValues}
                onFormUpdate={handleFormUpdate}
                storageKey="calendar-chat-new"
              />
            </div>
          </div>

          {/* Right: Event Form */}
          <div className="w-full lg:w-1/2">
            <EventForm
              mode="create"
              externalValues={externalValues}
              onSuccess={handleSuccess}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
