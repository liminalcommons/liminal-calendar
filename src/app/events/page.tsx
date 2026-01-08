'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { GoldenHoursBanner } from '@/components/GoldenHoursBanner';
import { EventCard, DisplayEvent } from '@/components/EventCard';
import { getEvents, CalendarEvent } from '@/lib/supabase';
import { GoogleCalendarEvent } from '@/lib/google-calendar';
import { SunRune, CommunityRune, SyncedRune } from '@/components/runes';

type SourceFilter = 'all' | 'community' | 'google';

// Convert Supabase events to DisplayEvents
function toDisplayEvent(event: CalendarEvent): DisplayEvent {
  return {
    ...event,
    source: 'community',
  };
}

// Convert Google events to DisplayEvents
function googleToDisplayEvent(event: GoogleCalendarEvent): DisplayEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    event_url: event.event_url,
    creator_id: 'google',
    creator_name: 'Liminal Commons',
    timezone: 'UTC',
    is_golden_hour: false,
    status: 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'google',
  };
}

export default function EventsPage() {
  const [communityEvents, setCommunityEvents] = useState<CalendarEvent[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goldenOnly, setGoldenOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);

        // Fetch from both sources
        const [community, googleResponse] = await Promise.all([
          getEvents({
            startDate: new Date(),
            goldenHourOnly: goldenOnly,
          }).catch(() => [] as CalendarEvent[]),
          fetch('/api/google-calendar?upcoming=true&limit=50')
            .then(res => res.json())
            .then(data => data.events || [])
            .catch(() => [] as GoogleCalendarEvent[]),
        ]);

        setCommunityEvents(community);
        setGoogleEvents(googleResponse);
        setError(null);
      } catch (e) {
        setError('Failed to load events');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, [goldenOnly]);

  // Merge and filter events
  const allEvents: DisplayEvent[] = [
    ...(sourceFilter !== 'google' ? communityEvents.map(toDisplayEvent) : []),
    ...(sourceFilter !== 'community' ? googleEvents.map(googleToDisplayEvent) : []),
  ].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <div className="min-h-screen" style={{ background: 'var(--parchment)' }}>
      <Header />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <GoldenHoursBanner />

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-3xl font-rune" style={{ color: 'var(--stone-800)' }}>
            All Events
          </h1>

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Source filter */}
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => setSourceFilter('all')}
                className={`px-3 py-1 rounded transition-colors ${
                  sourceFilter === 'all' ? 'btn-rune' : ''
                }`}
                style={sourceFilter !== 'all' ? { color: 'var(--stone-500)' } : {}}
              >
                All
              </button>
              <button
                onClick={() => setSourceFilter('community')}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1 ${
                  sourceFilter === 'community' ? 'rune-badge-stone' : ''
                }`}
                style={sourceFilter !== 'community' ? { color: 'var(--stone-500)' } : {}}
              >
                <CommunityRune size="sm" /> Community
              </button>
              <button
                onClick={() => setSourceFilter('google')}
                className={`px-3 py-1 rounded transition-colors flex items-center gap-1 ${
                  sourceFilter === 'google' ? 'rune-badge-synced' : ''
                }`}
                style={sourceFilter !== 'google' ? { color: 'var(--stone-500)' } : {}}
              >
                <SyncedRune size="sm" /> Google
              </button>
            </div>

            {/* Golden Hours filter */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={goldenOnly}
                onChange={(e) => setGoldenOnly(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'var(--gold-500)' }}
              />
              <span className="text-sm flex items-center gap-1" style={{ color: 'var(--stone-600)' }}>
                <SunRune size="sm" variant="gold" /> Golden Hours only
              </span>
            </label>
          </div>
        </div>

        <div className="horizon-line mb-6" />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="event-card p-4 animate-pulse"
              >
                <div className="h-5 rounded w-1/3 mb-2" style={{ background: 'var(--stone-200)' }}></div>
                <div className="h-4 rounded w-2/3" style={{ background: 'var(--stone-200)' }}></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="portal-frame p-8 text-center" style={{ background: 'var(--stone-50)' }}>
            <p style={{ color: 'var(--gold-700)' }}>{error}</p>
          </div>
        ) : allEvents.length === 0 ? (
          <div className="portal-frame p-8 text-center" style={{ background: 'var(--stone-50)' }}>
            <p style={{ color: 'var(--stone-500)' }}>
              {goldenOnly
                ? 'No events scheduled during Golden Hours.'
                : 'No upcoming events scheduled.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allEvents.map((event) => (
              <EventCard key={event.id} event={event} showFullDate />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
