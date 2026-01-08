'use client';

import { useState, useEffect, useMemo } from 'react';
import { DisplayEvent } from './EventCard';
import { isGoldenHour, formatTimeInTimezone, formatDateTimeInTimezone, getUserTimezone } from '@/lib/golden-hours';
import { SunRune, CommunityRune, SyncedRune, RuneIcon } from './runes';
import Link from 'next/link';

interface WeeklyCalendarProps {
  events: DisplayEvent[];
}

// Get start of week (Monday)
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get array of 7 days starting from Monday
function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_RUNES = ['ᛗ', 'ᛏ', 'ᚹ', 'ᚦ', 'ᚠ', 'ᛊ', 'ᛊ']; // Mannaz, Tiwaz, Wunjo, Thurisaz, Fehu, Sowilo, Sowilo

// Event Detail Modal Component
function EventDetailModal({
  event,
  onClose,
  timezone
}: {
  event: DisplayEvent;
  onClose: () => void;
  timezone: string;
}) {
  const isGolden = isGoldenHour(new Date(event.starts_at));
  const isGoogleEvent = event.source === 'google';
  const formattedTime = formatDateTimeInTimezone(new Date(event.starts_at), timezone);

  // Calculate duration if end time exists
  let duration = '';
  if (event.ends_at) {
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) {
      duration = `${diffMins} minutes`;
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      duration = mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="portal-frame max-w-lg w-full max-h-[80vh] overflow-y-auto"
        style={{ background: 'var(--parchment)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 border-b"
          style={{
            background: isGolden ? 'var(--gold-100)' : 'var(--stone-100)',
            borderColor: 'var(--stone-200)'
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {isGoogleEvent ? <SyncedRune size="md" /> : <CommunityRune size="md" />}
                {isGolden && <SunRune size="md" />}
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    background: isGoogleEvent ? 'var(--stone-200)' : 'var(--gold-200)',
                    color: isGoogleEvent ? 'var(--stone-700)' : 'var(--gold-800)'
                  }}
                >
                  {isGoogleEvent ? 'Synced' : 'Community'}
                </span>
              </div>
              <h3 className="font-rune text-xl" style={{ color: 'var(--stone-800)' }}>
                {event.title}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded hover:opacity-70"
              style={{ color: 'var(--stone-500)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Time */}
          <div className="flex items-center gap-2">
            <RuneIcon rune="dagaz" size="md" variant="gold" />
            <div>
              <div className="font-medium" style={{ color: 'var(--stone-800)' }}>
                {formattedTime}
              </div>
              {duration && (
                <div className="text-sm" style={{ color: 'var(--stone-500)' }}>
                  Duration: {duration}
                </div>
              )}
            </div>
          </div>

          {/* Golden Hour Badge */}
          {isGolden && (
            <div
              className="flex items-center gap-2 p-2 rounded"
              style={{ background: 'var(--gold-100)' }}
            >
              <SunRune size="md" />
              <span style={{ color: 'var(--gold-800)' }}>
                This event is during Golden Hours! ✨
              </span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <h4 className="font-medium mb-1" style={{ color: 'var(--stone-700)' }}>
                Description
              </h4>
              <div
                className="text-sm whitespace-pre-wrap"
                style={{ color: 'var(--stone-600)' }}
                dangerouslySetInnerHTML={{
                  __html: event.description
                    .replace(/\n/g, '<br/>')
                    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-600 underline">$1</a>')
                }}
              />
            </div>
          )}

          {/* Location */}
          {event.location && !event.location.startsWith('http') && (
            <div>
              <h4 className="font-medium mb-1" style={{ color: 'var(--stone-700)' }}>
                Location
              </h4>
              <div className="text-sm" style={{ color: 'var(--stone-600)' }}>
                {event.location}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="p-4 border-t flex gap-3"
          style={{ borderColor: 'var(--stone-200)' }}
        >
          {event.event_url && (
            <a
              href={event.event_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-rune flex-1 text-center"
            >
              🚀 Join Meeting
            </a>
          )}
          {!isGoogleEvent && (
            <Link
              href={`/events/${event.id}`}
              className="btn-rune flex-1 text-center"
              style={{
                background: 'var(--stone-200)',
                color: 'var(--stone-700)'
              }}
            >
              View Full Details
            </Link>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded"
            style={{
              background: 'var(--stone-100)',
              color: 'var(--stone-600)'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function WeeklyCalendar({ events }: WeeklyCalendarProps) {
  const [mounted, setMounted] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));
  const [timezone, setTimezone] = useState('UTC');
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);

  useEffect(() => {
    setMounted(true);
    setTimezone(getUserTimezone());
  }, []);

  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const grouped: Map<string, DisplayEvent[]> = new Map();
    weekDays.forEach(day => {
      const dateKey = day.toISOString().split('T')[0];
      grouped.set(dateKey, []);
    });

    events.forEach(event => {
      const eventDate = new Date(event.starts_at);
      const dateKey = eventDate.toISOString().split('T')[0];
      if (grouped.has(dateKey)) {
        grouped.get(dateKey)!.push(event);
      }
    });

    // Sort events within each day: Golden Hour events first, then by start time
    grouped.forEach((dayEvents) => {
      dayEvents.sort((a, b) => {
        const aIsGolden = isGoldenHour(new Date(a.starts_at)) ? 0 : 1;
        const bIsGolden = isGoldenHour(new Date(b.starts_at)) ? 0 : 1;
        if (aIsGolden !== bIsGolden) return aIsGolden - bIsGolden;
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      });
    });

    return grouped;
  }, [events, weekDays]);

  const goToPrevWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToThisWeek = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  // Format month/year header
  const monthYear = currentWeekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="portal-frame p-4" style={{ background: 'var(--stone-50)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-rune text-lg" style={{ color: 'var(--stone-800)' }}>
            <RuneIcon rune="dagaz" size="md" variant="gold" className="mr-2" />
            {monthYear}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevWeek}
              className="p-2 rounded threshold-glow"
              style={{ color: 'var(--stone-600)' }}
            >
              ←
            </button>
            <button
              onClick={goToThisWeek}
              className="px-3 py-1 text-sm rounded"
              style={{ background: 'var(--gold-200)', color: 'var(--gold-800)' }}
            >
              Today
            </button>
            <button
              onClick={goToNextWeek}
              className="p-2 rounded threshold-glow"
              style={{ color: 'var(--stone-600)' }}
            >
              →
            </button>
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day headers */}
          {weekDays.map((day, i) => {
            const isToday = day.getTime() === today.getTime();
            const isWeekend = i >= 5;
            return (
              <div
                key={`header-${i}`}
                className="text-center py-2 rounded-t"
                style={{
                  background: isToday ? 'var(--gold-100)' : isWeekend ? 'var(--gold-50)' : 'transparent',
                }}
              >
                <span
                  className="text-xs block"
                  style={{ color: 'var(--stone-500)' }}
                >
                  {DAY_RUNES[i]}
                </span>
                <span
                  className="font-medium text-sm"
                  style={{ color: isToday ? 'var(--gold-800)' : 'var(--stone-700)' }}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`block text-lg font-rune ${isToday ? 'font-bold' : ''}`}
                  style={{ color: isToday ? 'var(--gold-700)' : 'var(--stone-600)' }}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}

          {/* Event cells */}
          {weekDays.map((day, i) => {
            const dateKey = day.toISOString().split('T')[0];
            const dayEvents = eventsByDay.get(dateKey) || [];
            const isToday = day.getTime() === today.getTime();
            const isWeekend = i >= 5;

            return (
              <div
                key={`cell-${i}`}
                className="min-h-[150px] p-1 rounded-b border-t"
                style={{
                  background: isToday ? 'var(--gold-50)' : isWeekend ? 'rgba(251, 191, 36, 0.05)' : 'var(--parchment)',
                  borderColor: 'var(--stone-200)',
                }}
              >
                {dayEvents.length === 0 ? (
                  <div className="text-center text-xs py-4" style={{ color: 'var(--stone-400)' }}>
                    —
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.slice(0, 5).map((event) => {
                      const isGolden = isGoldenHour(new Date(event.starts_at));
                      const time = mounted ? formatTimeInTimezone(new Date(event.starts_at), timezone) : '--:--';
                      const isGoogleEvent = event.source === 'google';

                      return (
                        <button
                          key={event.id}
                          onClick={() => setSelectedEvent(event)}
                          className="block w-full p-1.5 rounded text-xs text-left hover:opacity-80 transition-opacity cursor-pointer"
                          style={{
                            background: isGolden ? 'var(--gold-200)' : 'var(--stone-200)',
                            color: isGolden ? 'var(--gold-900)' : 'var(--stone-700)',
                          }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="font-mono text-[10px]">{time}</span>
                            {isGoogleEvent ? <SyncedRune size="sm" /> : <CommunityRune size="sm" />}
                            {isGolden && <SunRune size="sm" />}
                          </div>
                          <div className="font-medium leading-tight">
                            {event.title}
                          </div>
                        </button>
                      );
                    })}
                    {dayEvents.length > 5 && (
                      <div className="text-xs text-center py-1" style={{ color: 'var(--stone-500)' }}>
                        +{dayEvents.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          timezone={timezone}
        />
      )}
    </>
  );
}
