import Link from 'next/link';
import { Header } from '@/components/Header';
import { GoldenHoursBanner } from '@/components/GoldenHoursBanner';
import { DisplayEvent } from '@/components/EventCard';
import { WeeklyCalendar } from '@/components/WeeklyCalendar';
import { EventsComing } from '@/components/EventsComing';
import { getUpcomingEvents, CalendarEvent } from '@/lib/supabase';
import { getUpcomingGoogleEvents, GoogleCalendarEvent } from '@/lib/google-calendar';
import { SunRune, CommunityRune, SyncedRune, ThresholdRune } from '@/components/runes';

export const revalidate = 60; // Revalidate every minute

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
    is_golden_hour: false, // Will be calculated on render
    status: 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'google',
  };
}

export default async function HomePage() {
  let communityEvents: CalendarEvent[] = [];
  let googleEvents: GoogleCalendarEvent[] = [];
  let error: string | null = null;

  // Fetch from both sources in parallel
  try {
    const [community, google] = await Promise.all([
      getUpcomingEvents(20).catch(() => [] as CalendarEvent[]),
      getUpcomingGoogleEvents(20).catch(() => [] as GoogleCalendarEvent[]),
    ]);
    communityEvents = community;
    googleEvents = google;
  } catch (e) {
    error = 'Unable to load events. Please check your connection.';
    console.error('Failed to fetch events:', e);
  }

  // Merge and sort events
  const allEvents: DisplayEvent[] = [
    ...communityEvents.map(toDisplayEvent),
    ...googleEvents.map(googleToDisplayEvent),
  ].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <div className="min-h-screen" style={{ background: 'var(--parchment)' }}>
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Golden Hours Banner */}
        <GoldenHoursBanner />

        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-rune mb-4"
            style={{ color: 'var(--stone-800)' }}
          >
            <ThresholdRune size="lg" variant="gold" className="mr-2" />
            Liminal Commons Calendar
            <ThresholdRune size="lg" variant="gold" className="ml-2" />
          </h1>
          <p
            className="text-xl max-w-2xl mx-auto"
            style={{ color: 'var(--stone-600)' }}
          >
            Coordinate across time zones. Schedule during{' '}
            <span style={{ color: 'var(--gold-600)' }} className="font-semibold">
              <SunRune size="sm" /> Golden Hours <SunRune size="sm" />
            </span>{' '}
            for maximum attendance.
          </p>
        </div>

        <div className="horizon-line" />

        {error ? (
          <div
            className="portal-frame p-8 text-center"
            style={{ background: 'var(--stone-50)' }}
          >
            <p style={{ color: 'var(--stone-500)' }}>{error}</p>
            <p className="text-sm mt-2" style={{ color: 'var(--stone-400)' }}>
              Make sure Supabase is configured correctly.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Events Coming */}
            <div className="lg:col-span-1">
              <h2
                className="text-xl font-rune mb-4"
                style={{ color: 'var(--stone-800)' }}
              >
                <SunRune size="md" variant="gold" className="mr-2" />
                Events Coming
              </h2>
              {allEvents.length > 0 ? (
                <EventsComing events={allEvents} limit={4} />
              ) : (
                <div
                  className="portal-frame p-6 text-center"
                  style={{ background: 'var(--stone-50)' }}
                >
                  <p className="mb-4" style={{ color: 'var(--stone-500)' }}>
                    No upcoming events scheduled.
                  </p>
                  <Link href="/events/new" className="btn-rune inline-flex items-center gap-2">
                    <SunRune size="sm" />
                    Create the first event
                  </Link>
                </div>
              )}
            </div>

            {/* Right Column - Weekly Calendar */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-xl font-rune"
                  style={{ color: 'var(--stone-800)' }}
                >
                  Weekly View
                </h2>
                <Link
                  href="/events"
                  className="threshold-glow px-3 py-1 rounded text-sm"
                  style={{ color: 'var(--gold-700)' }}
                >
                  View all events →
                </Link>
              </div>
              <WeeklyCalendar events={allEvents} />
            </div>
          </div>
        )}

        <div className="horizon-line" />

        {/* How It Works */}
        <section className="mt-8">
          <h2
            className="text-2xl font-rune mb-6 text-center"
            style={{ color: 'var(--stone-800)' }}
          >
            How The Threshold Works
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div
              className="portal-frame p-6 text-center"
              style={{ background: 'var(--stone-50)' }}
            >
              <div className="text-4xl mb-3">
                <SunRune size="xl" variant="gold" />
              </div>
              <h3
                className="font-rune font-semibold mb-2"
                style={{ color: 'var(--stone-700)' }}
              >
                Golden Hours
              </h3>
              <p className="text-sm" style={{ color: 'var(--stone-600)' }}>
                Optimized times for Europe, Americas, and Brazil overlap.
              </p>
            </div>
            <div
              className="portal-frame p-6 text-center"
              style={{ background: 'var(--stone-50)' }}
            >
              <div className="text-4xl mb-3">
                <SyncedRune size="xl" />
              </div>
              <h3
                className="font-rune font-semibold mb-2"
                style={{ color: 'var(--stone-700)' }}
              >
                Google Sync
              </h3>
              <p className="text-sm" style={{ color: 'var(--stone-600)' }}>
                Events from our Google Calendar appear here automatically.
              </p>
            </div>
            <div
              className="portal-frame p-6 text-center"
              style={{ background: 'var(--stone-50)' }}
            >
              <div className="text-4xl mb-3">
                <CommunityRune size="xl" />
              </div>
              <h3
                className="font-rune font-semibold mb-2"
                style={{ color: 'var(--stone-700)' }}
              >
                Community Events
              </h3>
              <p className="text-sm" style={{ color: 'var(--stone-600)' }}>
                Any member can create events. Only creators can edit or delete.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className="border-t mt-16"
        style={{ borderColor: 'var(--stone-200)', background: 'var(--stone-50)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-8 text-center text-sm" style={{ color: 'var(--stone-500)' }}>
          <p className="font-rune">
            <ThresholdRune size="sm" /> Liminal Commons <ThresholdRune size="sm" />
          </p>
          <p className="mt-2">Coordinating distributed communities since 2025</p>
        </div>
      </footer>
    </div>
  );
}
