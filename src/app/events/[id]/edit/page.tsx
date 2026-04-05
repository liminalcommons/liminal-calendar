'use client'

import { useState, useCallback, use } from 'react'
import { NavBar } from '@/components/NavBar'
import { EventForm } from '@/components/events/EventForm'
import { ChatPanel } from '@/components/chat/ChatPanel'
import type { EventFormValues } from '@/lib/chat-tools'

export default function EditEventPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [externalValues, setExternalValues] = useState<Partial<EventFormValues>>({})

  const handleFormUpdate = useCallback((updates: Partial<EventFormValues>) => {
    setExternalValues(prev => ({ ...prev, ...updates }))
  }, [])

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 'calc(100vh - 160px)' }}>
          {/* Left: Chat Panel */}
          <div className="w-full lg:w-[40%] lg:min-h-0">
            <div className="lg:sticky lg:top-4 h-[400px] lg:h-[calc(100vh-180px)]">
              <ChatPanel
                formValues={externalValues}
                onFormUpdate={handleFormUpdate}
                storageKey={`calendar-chat-${id}`}
              />
            </div>
          </div>

          {/* Right: Event Form */}
          <div className="w-full lg:w-[60%]">
            <EventForm
              mode="edit"
              eventId={id}
              externalValues={externalValues}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
