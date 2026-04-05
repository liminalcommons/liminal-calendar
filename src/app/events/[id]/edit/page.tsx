'use client'

import { useState, useCallback, use } from 'react'
import { NavBar } from '@/components/NavBar'
import { EventForm } from '@/components/events/EventForm'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MobileTabLayout } from '@/components/MobileTabLayout'
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
        <MobileTabLayout
          chatPanel={
            <ChatPanel
              formValues={externalValues}
              onFormUpdate={handleFormUpdate}
              storageKey={`calendar-chat-${id}`}
            />
          }
          formPanel={
            <EventForm
              mode="edit"
              eventId={id}
              externalValues={externalValues}
            />
          }
        />
      </main>
    </div>
  )
}
