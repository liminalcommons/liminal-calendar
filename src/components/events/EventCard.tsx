'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Video, ExternalLink } from 'lucide-react'
import { RuneAccent } from '@/components/RuneAccent'
import { formatTimeInTimezone, getUserTimezone } from '@/lib/timezone-utils'
import { formatDuration } from '@/lib/calendar-utils'
import type { DisplayEvent } from '@/lib/display-event'

function getRelativeTime(startsAt: string): string {
  const now = Date.now()
  const start = new Date(startsAt).getTime()
  const diff = start - now

  if (diff < 0) return 'Started'
  if (diff < 60_000) return 'In <1m'
  if (diff < 3600_000) return `In ${Math.round(diff / 60_000)}m`
  if (diff < 86400_000) return `In ${Math.round(diff / 3600_000)}h`
  const days = Math.round(diff / 86400_000)
  return days === 1 ? 'Tomorrow' : `In ${days} days`
}

interface EventCardProps {
  event: DisplayEvent
}

export function EventCard({ event }: EventCardProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const tz = mounted ? getUserTimezone() : 'UTC'
  const startDate = new Date(event.starts_at)
  const timeStr = mounted ? formatTimeInTimezone(startDate, tz) : '...'
  const duration = formatDuration(event.starts_at, event.ends_at)
  const relTime = mounted ? getRelativeTime(event.starts_at) : ''

  return (
    <Link
      href={`/events/${event.id}`}
      className="block bg-grove-surface rounded-lg border border-grove-border/20 p-3.5 mb-2 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex gap-3">
        {/* Image thumbnail */}
        {event.imageUrl && (
          <div className="w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
            <img
              src={event.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <RuneAccent seed={parseInt(event.id, 10) || 0} className="text-sm opacity-20" />
            <h3 className="font-serif text-[15px] font-semibold text-grove-text truncate">
              {event.title}
            </h3>
            {event.recurrenceRule && (
              <span className="text-[10px] bg-grove-green/10 text-grove-green-deep px-1.5 py-0.5 rounded flex-shrink-0">
                recurring
              </span>
            )}
          </div>

          {/* Time + host */}
          <div className="text-xs text-grove-text-muted mt-1">
            {timeStr}
            {duration && ` · ${duration}`}
            {event.creator_name && ` · ${event.creator_name}`}
          </div>

          {/* Description preview */}
          {event.description && (
            <p className="text-xs text-grove-text-dim mt-1 line-clamp-2">
              {event.description.replace(/<[^>]*>/g, '')}
            </p>
          )}

          {/* Meeting link */}
          {event.event_url && (
            <a
              href={event.event_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-grove-green hover:text-grove-green-deep
                         bg-grove-green/10 border border-grove-green/20 rounded px-2 py-1 mt-1.5 transition-colors"
            >
              <Video size={12} className="shrink-0" />
              Join Meeting
              <ExternalLink size={9} className="shrink-0 opacity-60" />
            </a>
          )}

          {/* Bottom row: attendees + relative time */}
          <div className="flex items-center justify-between mt-2">
            {event.attendees.total > 0 && (
              <span className="text-[11px] text-grove-text-muted">
                {event.attendees.going} going
                {event.attendees.interested > 0 && ` · ${event.attendees.interested} interested`}
              </span>
            )}
            {mounted && relTime && (
              <span className="text-[11px] text-grove-accent font-medium ml-auto">
                {relTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
