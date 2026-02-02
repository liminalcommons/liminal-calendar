'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CalendarEvent } from '@/lib/supabase';
import { isGoldenHour, formatDateTimeInTimezone, getUserTimezone } from '@/lib/golden-hours';
import { getEventTypeConfig } from '@/lib/event-types';
import { isRecurringEvent } from '@/lib/recurrence';
import { CommunityBadge, GoldenHourBadge, SyncedBadge, SunRune, CommunityRune, SyncedRune } from './runes';

export interface DisplayEvent extends Omit<CalendarEvent, 'id'> {
  id: string;
  source: 'community' | 'google';
  location?: string | null; // From Google Calendar events
  isRecurring?: boolean; // From Google Calendar events
}

interface EventCardProps {
  event: DisplayEvent;
  showFullDate?: boolean;
}

export function EventCard({ event, showFullDate = false }: EventCardProps) {
  const [mounted, setMounted] = useState(false);
  const [formattedTime, setFormattedTime] = useState('');
  const [relativeTime, setRelativeTime] = useState('');

  const startDate = new Date(event.starts_at);
  const isGolden = isGoldenHour(startDate);
  const isGoogleEvent = event.source === 'google';
  const eventTypeConfig = getEventTypeConfig(event.event_type);
  const isRecurring = event.isRecurring || isRecurringEvent(event);

  useEffect(() => {
    setMounted(true);
    const timezone = getUserTimezone();
    const eventStartDate = new Date(event.starts_at);
    setFormattedTime(formatDateTimeInTimezone(eventStartDate, timezone));

    // Calculate relative time
    const now = new Date();
    const diffMs = eventStartDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffMs < 0) {
      relative = 'Started';
    } else if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      relative = `In ${diffMins} min`;
    } else if (diffHours < 24) {
      relative = `In ${diffHours}h`;
    } else if (diffDays === 1) {
      relative = 'Tomorrow';
    } else {
      relative = `In ${diffDays} days`;
    }
    setRelativeTime(relative);
  }, [event.starts_at]);

  const CardContent = (
    <div
      className={`event-card p-4 ${isGolden ? 'event-card-golden' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {/* Event type badge */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${eventTypeConfig.bgColor} ${eventTypeConfig.textColor} ${eventTypeConfig.borderColor}`}
            >
              <span>{eventTypeConfig.icon}</span>
              <span>{eventTypeConfig.label}</span>
            </span>

            {/* Source badge */}
            {isGoogleEvent ? (
              <SyncedBadge showLabel={false} />
            ) : (
              <CommunityBadge showLabel={false} />
            )}

            {/* Golden hour badge */}
            {isGolden && <GoldenHourBadge />}

            {/* Recurring badge */}
            {isRecurring && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                🔄 Recurring
              </span>
            )}
          </div>

          <h3
            className="font-semibold text-lg truncate"
            style={{ color: 'var(--stone-800)', fontFamily: "'Cinzel', serif" }}
          >
            {event.title}
          </h3>

          {event.description && (
            <p
              className="text-sm mt-1 line-clamp-2"
              style={{ color: 'var(--stone-600)' }}
            >
              {event.description}
            </p>
          )}

          <p className="text-sm mt-2" style={{ color: 'var(--stone-500)' }}>
            {isGoogleEvent ? (
              <>
                <SyncedRune size="sm" className="mr-1" />
                Synced from Google
              </>
            ) : (
              <>
                <CommunityRune size="sm" className="mr-1" />
                By {event.creator_name}
              </>
            )}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p
            className="text-sm font-medium flex items-center justify-end gap-1"
            style={{ color: isGolden ? 'var(--gold-700)' : 'var(--stone-600)' }}
          >
            {isGolden && <SunRune size="sm" />}
            {mounted ? relativeTime : (
              <span className="inline-block w-12 h-4 rounded animate-pulse" style={{ background: 'var(--stone-200)' }} />
            )}
          </p>
          {showFullDate && (
            <p className="text-xs mt-1" style={{ color: 'var(--stone-500)' }}>
              {mounted ? formattedTime : (
                <span className="inline-block w-24 h-3 rounded animate-pulse" style={{ background: 'var(--stone-200)' }} />
              )}
            </p>
          )}
        </div>
      </div>

      {event.event_url && (
        <div
          className="mt-3 flex items-center gap-1 text-sm"
          style={{ color: 'var(--mystic-blue)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Meeting link available</span>
        </div>
      )}
    </div>
  );

  // All events link to detail page - users can join from there
  return (
    <Link href={`/events/${event.id}?source=${event.source}`}>
      {CardContent}
    </Link>
  );
}
