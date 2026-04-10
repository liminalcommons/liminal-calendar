'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EventCard } from '@/components/events/EventCard'
import { EventCountdown } from '@/components/events/EventCountdown'
import { NavBar } from '@/components/NavBar'
import { getUpcomingEvents, groupEventsByDateLabel } from '@/lib/calendar-utils'
import type { DisplayEvent } from '@/lib/display-event'

export default function ListPage() {
  const { data: session } = useSession()
  const [events, setEvents] = useState<DisplayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const userRole = (session?.user as any)?.role

  useEffect(() => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const to = new Date(now.getFullYear(), now.getMonth() + 7, 1).toISOString()
    fetch(`/api/events?from=${from}&to=${to}&limit=200`)
      .then(r => {
        if (r.status === 401) {
          // Token expired — redirect to gateway for fresh auth
          const gateway = 'https://auth.castalia.one';
          window.location.href = `${gateway}/signin?callbackUrl=${encodeURIComponent(window.location.href)}`;
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setEvents(getUpcomingEvents(data, 20))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

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
