'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EventCard } from '@/components/events/EventCard'
import { EventCountdown } from '@/components/events/EventCountdown'
import type { DisplayEvent } from '@/lib/display-event'

export interface UpcomingViewProps {
  /** Limicon scope — adds ?conference= to the API call. */
  conferenceSlug?: string
  title?: string
  newEventHref?: string
  showCreate?: boolean
}

/**
 * "What's coming up in the next 24 hours" — rolling window, soonest first.
 * Shared by /upcoming and the Limicon upcoming tab.
 */
export function UpcomingView({
  conferenceSlug,
  title = 'Next 24 hours',
  newEventHref = '/events/new',
  showCreate = false,
}: UpcomingViewProps) {
  const { data: session } = useSession()
  const [events, setEvents] = useState<DisplayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const userId = session?.user?.id
  const rawRef = useRef<unknown[] | null>(null)

  const cacheKey = `cal:upcoming:v1:${conferenceSlug ?? 'main'}:${userId ?? 'anon'}`

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const params = new URLSearchParams({
      from: now.toISOString(),
      to: end.toISOString(),
      limit: '100',
    })
    if (conferenceSlug) params.set('conference', conferenceSlug)
    fetch(`/api/events?${params.toString()}`)
      .then((r) => {
        if (r.status === 401) return []
        return r.json()
      })
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return
        const upcoming = (data as DisplayEvent[])
          .filter((e) => {
            const start = new Date(e.starts_at).getTime()
            const endMs = e.ends_at ? new Date(e.ends_at).getTime() : start
            return start <= end.getTime() && endMs >= now.getTime()
          })
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
        rawRef.current = upcoming
        setEvents(upcoming)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conferenceSlug])

  useEffect(() => {
    if (!userId || !rawRef.current) return
    try {
      localStorage.setItem(cacheKey, JSON.stringify(rawRef.current))
    } catch {
      /* non-fatal */
    }
  }, [cacheKey, userId, events])

  useEffect(() => {
    if (!userId || !loading) return
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return
      const raw = JSON.parse(cached)
      if (Array.isArray(raw)) {
        setEvents(raw)
        setLoading(false)
      }
    } catch {
      /* network will fill in */
    }
  }, [cacheKey, userId, loading])

  const nextEvent = events[0] || null

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-grove-text font-light">{title}</h1>
          <p className="text-sm text-grove-text-muted">
            {events.length === 0 ? 'Nothing scheduled' : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {showCreate && (
          <Link
            href={newEventHref}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            New Event
          </Link>
        )}
      </div>

      {nextEvent && <EventCountdown event={nextEvent} />}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-grove-surface rounded-lg animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-center text-grove-text-muted py-12 italic">
          Quiet for the next day — check the full list for what&apos;s ahead.
        </p>
      ) : (
        <div className="space-y-0">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </main>
  )
}
