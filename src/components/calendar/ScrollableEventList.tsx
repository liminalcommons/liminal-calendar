'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useResolvedRole } from '@/lib/use-resolved-role'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EventCard } from '@/components/events/EventCard'
import { EventCountdown } from '@/components/events/EventCountdown'
import { groupEventsByDateLabel } from '@/lib/calendar-utils'
import { expandRecurringEvents } from '@/lib/recurrence-expander'
import type { DisplayEvent } from '@/lib/display-event'

const PAGE_SIZE = 60

export interface ScrollableEventListProps {
  /** Limicon scope — adds ?conference= to the API call + scopes the cache. */
  conferenceSlug?: string
  title: string
  subtitle?: string
  newEventHref: string
  /** Conference mode: any signed-in member may create while the conference is active. */
  conferenceActive?: boolean
  emptyText?: string
  cachePrefix?: string
  monthsBack?: number
  monthsForward?: number
}

/**
 * Bottomless event list: initial window load, then IntersectionObserver
 * paging (offset/limit) as the reader scrolls. Shared by /list and the
 * Limicon conference list. Recurring masters are expanded per batch and
 * merged by instance id, so a master reappearing across pages can't duplicate.
 */
export function ScrollableEventList({
  conferenceSlug,
  title,
  subtitle,
  newEventHref,
  conferenceActive = false,
  emptyText = 'No upcoming events',
  cachePrefix = 'cal:list:v2:',
  monthsBack = 1,
  monthsForward = 7,
}: ScrollableEventListProps) {
  const { data: session } = useSession()
  const [events, setEvents] = useState<DisplayEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const { role: clerkAwareRole } = useResolvedRole()
  const userRole = clerkAwareRole ?? session?.user?.role
  const userId = session?.user?.id

  const offsetRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const rawRef = useRef<unknown[] | null>(null)

  const windowRef = useRef<{ from: string; to: string } | null>(null)
  if (!windowRef.current) {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
    const to = new Date(now.getFullYear(), now.getMonth() + monthsForward, 1)
    windowRef.current = { from: from.toISOString(), to: to.toISOString() }
  }

  const cacheKey = `${cachePrefix}${conferenceSlug ?? 'main'}:${userId ?? 'anon'}`

  const fetchBatch = useCallback(
    async (offset: number): Promise<DisplayEvent[]> => {
      const { from, to } = windowRef.current!
      const params = new URLSearchParams({
        from,
        to,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (conferenceSlug) params.set('conference', conferenceSlug)
      const r = await fetch(`/api/events?${params.toString()}`)
      if (r.status === 401) return []
      const data = await r.json()
      if (!Array.isArray(data)) return []
      const rangeStart = new Date(from)
      const rangeEnd = new Date(to)
      return expandRecurringEvents(data, rangeStart, rangeEnd)
    },
    [conferenceSlug],
  )

  const mergeBatch = useCallback((prev: DisplayEvent[], batch: DisplayEvent[]) => {
    const seen = new Set(prev.map((e) => e.id))
    const merged = [...prev]
    for (const e of batch) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        merged.push(e)
      }
    }
    merged.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    return merged
  }, [])

  // Initial load.
  useEffect(() => {
    let cancelled = false
    offsetRef.current = 0
    hasMoreRef.current = true
    setHasMore(true)
    fetchBatch(0)
      .then((batch) => {
        if (cancelled) return
        rawRef.current = batch
        setEvents(batch)
        setHasMore(batch.length >= PAGE_SIZE)
        hasMoreRef.current = batch.length >= PAGE_SIZE
        offsetRef.current = batch.length
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchBatch])

  // Persist raw payload for instant paint next open (per user + scope).
  useEffect(() => {
    if (!userId || !rawRef.current) return
    try {
      localStorage.setItem(cacheKey, JSON.stringify(rawRef.current))
    } catch {
      /* quota/disabled storage — non-fatal */
    }
  }, [cacheKey, userId, events])

  // Instant paint from cache while the network is still in flight.
  useEffect(() => {
    if (!userId || !loading) return
    try {
      const cached = localStorage.getItem(cacheKey)
      if (!cached) return
      const raw = JSON.parse(cached)
      if (!Array.isArray(raw)) return
      const { from, to } = windowRef.current!
      setEvents(expandRecurringEvents(raw, new Date(from), new Date(to)))
      setLoading(false)
    } catch {
      /* corrupt cache — network will fill in */
    }
  }, [cacheKey, userId, loading])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const batch = await fetchBatch(offsetRef.current)
      offsetRef.current += batch.length
      const done = batch.length < PAGE_SIZE
      hasMoreRef.current = !done
      setHasMore(!done)
      setEvents((prev) => mergeBatch(prev, batch))
    } catch {
      /* keep what we have; sentinel will retry on next intersection */
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [fetchBatch, mergeBatch])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: '600px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loading, loadMore])

  const canCreate =
    userRole === 'admin' || userRole === 'host' || userRole === 'governor' || conferenceActive

  const dateGroups = groupEventsByDateLabel(events)
  const nextEvent = events[0] || null

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-grove-text font-light">{title}</h1>
          <p className="text-sm text-grove-text-muted">
            {subtitle ?? `${events.length} events`}
          </p>
        </div>
        {canCreate && (
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
        <p className="text-center text-grove-text-muted py-12 italic">{emptyText}</p>
      ) : (
        <div className="space-y-0">
          {dateGroups.map((group) => (
            <div key={group.dateKey} className="relative pl-5 pb-4">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-grove-border" />
              <div
                className={`absolute left-[-3px] top-1 w-[8px] h-[8px] rounded-full ${
                  group.isToday
                    ? 'bg-grove-accent shadow-[0_0_0_3px_rgba(196,147,90,0.2)]'
                    : 'bg-grove-border'
                }`}
              />
              <div
                className={`text-[10px] uppercase tracking-[1px] mb-2 ${
                  group.isToday ? 'text-grove-accent font-semibold' : 'text-grove-text-muted'
                }`}
              >
                {group.label}
              </div>
              {group.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ))}
          <div ref={sentinelRef} aria-hidden="true" className="h-4" />
          {loadingMore && (
            <div className="space-y-4 pb-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-grove-surface rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {!hasMore && events.length > 0 && (
            <p className="text-center text-xs text-grove-text-muted py-6 italic">
              That&apos;s everything
            </p>
          )}
        </div>
      )}
    </main>
  )
}
