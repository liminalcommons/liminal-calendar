'use client'

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { EventForm } from '@/components/events/EventForm'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MobileTabLayout } from '@/components/MobileTabLayout'
import type { EventFormValues } from '@/lib/chat-tools'

function NewEventPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialFromUrl = useMemo<Partial<EventFormValues>>(() => {
    const out: Partial<EventFormValues> = {}
    const day = searchParams.get('day')
    const slotStr = searchParams.get('slot')
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) out.date = day
    if (slotStr != null) {
      const slot = Number(slotStr)
      if (Number.isFinite(slot) && slot >= 0 && slot < 48) {
        const h = Math.floor(slot / 2)
        const m = (slot % 2) * 30
        out.startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const endTotal = h * 60 + m + 60
        const eh = Math.min(23, Math.floor(endTotal / 60))
        const em = endTotal >= 24 * 60 ? 30 : endTotal % 60
        out.endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
      }
    }
    return out
  }, [searchParams])

  const [externalValues, setExternalValues] = useState<Partial<EventFormValues>>(initialFromUrl)

  // Read the QuickCreatePopover handoff (if any) and seed the form. The
  // handoff key is consumed once so a refresh on /events/new starts clean.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendar-quick-create-handoff')
      if (!raw) return
      localStorage.removeItem('calendar-quick-create-handoff')
      const draft = JSON.parse(raw) as Partial<EventFormValues>
      if (draft && typeof draft === 'object') {
        setExternalValues(prev => ({ ...prev, ...draft }))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

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

export default function NewEventPage() {
  return (
    <Suspense fallback={null}>
      <NewEventPageInner />
    </Suspense>
  )
}
