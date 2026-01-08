'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DisplayEvent } from './EventCard';
import { isGoldenHour, formatTimeInTimezone, getUserTimezone } from '@/lib/golden-hours';
import { SunRune, CommunityRune, SyncedRune, ThresholdRune } from './runes';

interface EventsComingProps {
  events: DisplayEvent[];
  limit?: number;
}

interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getCountdown(targetDate: Date): CountdownState {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

function CountdownTimer({ targetDate, isActive }: { targetDate: Date; isActive: boolean }) {
  const [countdown, setCountdown] = useState<CountdownState | null>(null);

  useEffect(() => {
    const updateCountdown = () => {
      setCountdown(getCountdown(targetDate));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  if (!countdown) {
    return (
      <div className="flex gap-2">
        <span className="inline-block w-16 h-8 rounded animate-pulse" style={{ background: 'var(--stone-200)' }} />
      </div>
    );
  }

  const { days, hours, minutes, seconds } = countdown;

  // Event has started
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
    return (
      <div
        className={`font-rune text-lg ${isActive ? 'golden-glow-active' : ''}`}
        style={{ color: 'var(--gold-600)' }}
      >
        <SunRune size="md" /> NOW LIVE <SunRune size="md" />
      </div>
    );
  }

  const TimeUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="text-center">
      <div
        className="font-rune text-2xl font-bold"
        style={{ color: isActive ? 'var(--gold-700)' : 'var(--stone-700)' }}
      >
        {value.toString().padStart(2, '0')}
      </div>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--stone-500)' }}>
        {label}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3">
      {days > 0 && <TimeUnit value={days} label="Days" />}
      <TimeUnit value={hours} label="Hrs" />
      <TimeUnit value={minutes} label="Min" />
      {days === 0 && <TimeUnit value={seconds} label="Sec" />}
    </div>
  );
}

export function EventsComing({ events, limit = 3 }: EventsComingProps) {
  const [mounted, setMounted] = useState(false);
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    setMounted(true);
    setTimezone(getUserTimezone());
  }, []);

  // Get next upcoming events
  const now = new Date();
  const upcomingEvents = events
    .filter(e => new Date(e.starts_at) > now)
    .slice(0, limit);

  if (upcomingEvents.length === 0) {
    return null;
  }

  const nextEvent = upcomingEvents[0];
  const nextEventDate = new Date(nextEvent.starts_at);
  const isGolden = isGoldenHour(nextEventDate);
  const isGoogleEvent = nextEvent.source === 'google';

  return (
    <div className="space-y-4">
      {/* Featured Next Event */}
      <div
        className={`portal-frame p-6 ${isGolden ? 'golden-glow' : ''}`}
        style={{
          background: isGolden
            ? 'linear-gradient(135deg, var(--gold-50), var(--gold-100))'
            : 'linear-gradient(135deg, var(--stone-50), var(--parchment))',
          borderColor: isGolden ? 'var(--gold-300)' : 'var(--stone-300)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ThresholdRune size="md" variant="gold" />
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--gold-600)' }}
          >
            Next Event
          </span>
        </div>

        <h3
          className="font-rune text-xl mb-2"
          style={{ color: 'var(--stone-800)' }}
        >
          {nextEvent.title}
        </h3>

        <div className="flex items-center gap-2 mb-4">
          {isGoogleEvent ? (
            <SyncedRune size="sm" />
          ) : (
            <CommunityRune size="sm" />
          )}
          {isGolden && (
            <span className="rune-badge-gold">
              <SunRune size="sm" /> Golden Hour
            </span>
          )}
        </div>

        <div className="mb-4">
          <CountdownTimer targetDate={nextEventDate} isActive={isGolden} />
        </div>

        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--stone-600)' }}>
          <span>
            {mounted
              ? `${nextEventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTimeInTimezone(nextEventDate, timezone)}`
              : '...'}
          </span>
          {nextEvent.event_url ? (
            <a
              href={nextEvent.event_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-rune text-sm py-1"
            >
              Join <SunRune size="sm" />
            </a>
          ) : !isGoogleEvent ? (
            <Link
              href={`/events/${nextEvent.id}`}
              className="btn-rune-secondary text-sm py-1"
            >
              Details
            </Link>
          ) : null}
        </div>
      </div>

      {/* Other Upcoming Events */}
      {upcomingEvents.length > 1 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium" style={{ color: 'var(--stone-600)' }}>
            Also Coming Up
          </h4>
          {upcomingEvents.slice(1).map((event) => {
            const eventDate = new Date(event.starts_at);
            const eventIsGolden = isGoldenHour(eventDate);
            const isGoogleEvent = event.source === 'google';

            // Determine link: Google events go external (or nowhere if no URL), community events go to detail page
            const href = isGoogleEvent
              ? (event.event_url || undefined)
              : `/events/${event.id}`;

            const content = (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isGoogleEvent ? <SyncedRune size="sm" /> : <CommunityRune size="sm" />}
                  {eventIsGolden && <SunRune size="sm" variant="gold" />}
                  <span className="font-medium" style={{ color: 'var(--stone-700)' }}>
                    {event.title}
                  </span>
                </div>
                <span className="text-sm" style={{ color: 'var(--stone-500)' }}>
                  {mounted
                    ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '...'}
                </span>
              </div>
            );

            const className = "block p-3 rounded border transition-all hover:border-gold-300";
            const style = {
              background: 'var(--stone-50)',
              borderColor: 'var(--stone-200)',
            };

            // If no href (Google event without URL), render as div
            if (!href) {
              return (
                <div key={event.id} className={className} style={style}>
                  {content}
                </div>
              );
            }

            return (
              <a
                key={event.id}
                href={href}
                target={isGoogleEvent ? '_blank' : undefined}
                rel={isGoogleEvent ? 'noopener noreferrer' : undefined}
                className={className}
                style={style}
              >
                {content}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
