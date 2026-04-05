'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { EventForm } from '@/components/events/EventForm'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MobileTabLayout } from '@/components/MobileTabLayout'
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

  const filledCount = useMemo(() => {
    let count = 0
    if (externalValues.title) count++
    if (externalValues.description) count++
    if (externalValues.startTime) count++
    if (externalValues.endTime) count++
    if (externalValues.date) count++
    if (externalValues.recurrence && externalValues.recurrence !== 'none') count++
    if (externalValues.imageUrl) count++
    return count
  }, [externalValues])

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

        <MobileTabLayout
          filledFieldCount={filledCount}
          chatPanel={
            <ChatPanel
              formValues={externalValues}
              onFormUpdate={handleFormUpdate}
              storageKey="calendar-chat-new"
            />
          }
          formPanel={
            <EventForm
              mode="create"
              externalValues={externalValues}
              onSuccess={handleSuccess}
            />
          }
        />
      </main>
    </div>
  )
}
