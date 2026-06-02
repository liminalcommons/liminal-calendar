'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useResolvedRole } from '@/lib/use-resolved-role'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EventCard } from '@/components/events/EventCard'
import { EventCountdown } from '@/components/events/EventCountdown'
import { NavBar } from '@/components/NavBar'
import { getUpcomingEvents, groupEventsByDateLabel } from '@/lib/calendar-utils'
import { expandRecurringEvents } from '@/lib/recurrence-expander'
import type { DisplayEvent } from '@/lib/display-event'

// localStorage SWR cache key. Versioned + per-user so a different account on
// the same browser can NEVER be shown a previous user's events.
const LIST_CACHE_PREFIX = 'cal:list:v1:'

export default function ListPage() {
  const { data: session } = useSession()
  const [events, setEvents] = useState<DisplayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const { role: clerkAwareRole } = useResolvedRole()
  const userRole = clerkAwareRole ?? session?.user?.role
  const userId = session?.user?.id

  // Hold the raw payload so the cache can be written once the user id resolves,
  // even if that happens after the fetch lands — keeps the fetch a single call.
  const rawRef = useRef<unknown[] | null>(null)

  // Network revalidate: cookie-authed, runs exactly once on mount independent of
  // the client session resolving.
  useEffect(() => {
    const now = new Date()
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 1)
    fetch(`/api/events?from=${rangeStart.toISOString()}&to=${rangeEnd.toISOString()}&limit=200`)
      .then(r => {
        if (r.status === 401) {
          console.warn('[list] 401 — session expired. Sign out and back in to refresh.');
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          // Master recurring rows carry their original startsAt (often in the
          // past). Without expansion, getUpcomingEvents filters them out and
          // the list looks empty even when the week grid is full.
          const expanded = expandRecurringEvents(data, rangeStart, rangeEnd)
          setEvents(getUpcomingEvents(expanded, 20))
          rawRef.current = data
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Persist the raw payload for instant paint next open, keyed by user id so a
  // different account on this browser can never be shown these events.
  useEffect(() => {
    if (!userId || !rawRef.current) return
    try { localStorage.setItem(LIST_CACHE_PREFIX + userId, JSON.stringify(rawRef.current)) } catch { /* quota/disabled storage — non-fatal */ }
  }, [userId, events])

  // Instant paint from cache — ONLY while the network is still in flight AND we
  // have a resolved user id whose cached payload we can safely show. This turns
  // a repeat open from "skeleton → wait" into "real content immediately".
  useEffect(() => {
    if (!userId || !loading) return
    try {
      const cached = localStorage.getItem(LIST_CACHE_PREFIX + userId)
      if (!cached) return
      const raw = JSON.parse(cached)
      if (!Array.isArray(raw)) return
      const now = new Date()
      const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 1)
      const expanded = expandRecurringEvents(raw, rangeStart, rangeEnd)
      setEvents(getUpcomingEvents(expanded, 20))
      setLoading(false)
    } catch { /* corrupt cache — ignore, network will fill in */ }
  }, [userId, loading])

  const dateGroups = groupEventsByDateLabel(events)
  const nextEvent = events[0] || null

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif text-grove-text font-light">
              Upcoming Events
            </h1>
            <p className="text-sm text-grove-text-muted">Next {events.length} events</p>
          </div>
          {(userRole === 'admin' || userRole === 'host') && (
            <Link
              href="/events/new"
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
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-grove-surface rounded-lg animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-center text-grove-text-muted py-12 italic">
            No upcoming events
          </p>
        ) : (
          <div className="space-y-0">
            {dateGroups.map(group => (
              <div key={group.dateKey} className="relative pl-5 pb-4">
                {/* Timeline spine */}
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-grove-border" />
                <div className={`absolute left-[-3px] top-1 w-[8px] h-[8px] rounded-full ${
                  group.isToday
                    ? 'bg-grove-accent shadow-[0_0_0_3px_rgba(196,147,90,0.2)]'
                    : 'bg-grove-border'
                }`} />
                <div className={`text-[10px] uppercase tracking-[1px] mb-2 ${
                  group.isToday ? 'text-grove-accent font-semibold' : 'text-grove-text-muted'
                }`}>
                  {group.label}
                </div>
                {group.events.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
