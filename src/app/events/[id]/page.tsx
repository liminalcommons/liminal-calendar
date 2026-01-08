'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { getEvent, deleteEvent, CalendarEvent } from '@/lib/supabase';
import { GoogleCalendarEvent } from '@/lib/google-calendar';
import {
  isGoldenHour,
  formatDateTimeInTimezone,
  getUserTimezone,
  getGoldenHoursForAllTimezones,
} from '@/lib/golden-hours';
import { TimeZoneStrip } from '@/components/TimeZoneStrip';
import { downloadICS } from '@/lib/ics-generator';
import { SyncedBadge, CommunityBadge } from '@/components/runes';
import { EventRSVPSection } from '@/components/EventRSVP';

// Unified event type for display
type DisplayEvent = (CalendarEvent | GoogleCalendarEvent) & {
  source: 'community' | 'google';
};

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();

  const [event, setEvent] = useState<DisplayEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [timezone, setTimezone] = useState('UTC');

  const eventId = params.id as string;
  const source = searchParams.get('source') || 'community';

  useEffect(() => {
    setTimezone(getUserTimezone());

    async function fetchEvent() {
      try {
        if (source === 'google') {
          // Fetch Google event from API
          const response = await fetch(`/api/google-calendar?eventId=${encodeURIComponent(eventId)}`);
          const data = await response.json();
          if (data.event) {
            setEvent({ ...data.event, source: 'google' });
          } else {
            setError('Event not found');
          }
        } else {
          // Fetch community event from Supabase
          const data = await getEvent(eventId);
          setEvent({ ...data, source: 'community' });
        }
      } catch (e) {
        setError('Event not found');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId, source]);

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      router.push('/events');
    } catch (e) {
      setError('Failed to delete event');
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  // Only community events can be deleted by their creator
  const isCreator = isLoaded && user && event && event.source === 'community' && 'creator_id' in event && user.id === event.creator_id;
  const startDate = event ? new Date(event.starts_at) : null;
  const endDate = event?.ends_at ? new Date(event.ends_at) : null;
  const isGolden = startDate ? isGoldenHour(startDate) : false;
  const isGoogleEvent = event?.source === 'google';
  const creatorName = !event ? 'Unknown' : (isGoogleEvent ? 'Liminal Commons' : ('creator_name' in event ? event.creator_name : 'Unknown'));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-red-500 mb-4">{error || 'Event not found'}</p>
            <Link href="/events" className="text-golden-600 hover:underline">
              ← Back to events
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/events"
          className="text-golden-600 dark:text-golden-400 hover:underline mb-4 inline-block"
        >
          ← Back to events
        </Link>

        <div
          className={`bg-white dark:bg-gray-800 rounded-lg border p-6 ${
            isGolden
              ? 'border-golden-300 dark:border-golden-700'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {isGoogleEvent ? <SyncedBadge /> : <CommunityBadge />}
                {isGolden && (
                  <span className="golden-badge">✨ Golden Hour</span>
                )}
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {event.title}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {isGoogleEvent ? 'Synced from Google Calendar' : `Created by ${creatorName}`}
              </p>
            </div>

            {isCreator && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Time */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
              📅 When
            </h2>
            <p className="text-lg text-gray-800 dark:text-gray-200">
              {startDate && formatDateTimeInTimezone(startDate, timezone)}
              {endDate && ` – ${formatDateTimeInTimezone(endDate, timezone)}`}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Your timezone: {timezone.split('/').pop()}
            </p>

            {/* Other timezones */}
            {startDate && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  In other timezones:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  {getGoldenHoursForAllTimezones().map(({ label, timezone: tz }) => (
                    <div key={tz}>
                      <span className="text-gray-500 dark:text-gray-400">{label}:</span>{' '}
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {formatDateTimeInTimezone(startDate, tz).split(',')[1]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div className="mb-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
                📝 Description
              </h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}

          {/* RSVP Section */}
          <EventRSVPSection eventId={event.id} eventSource={event.source} />

          {/* Meeting Link */}
          {event.event_url && (
            <div className="mb-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">
                🔗 Meeting Link
              </h2>
              <a
                href={event.event_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {event.event_url}
              </a>
            </div>
          )}

          {/* TimeZone Strip */}
          {startDate && (
            <div className="mb-6 p-4 bg-parchment dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700">
              <TimeZoneStrip selectedTime={startDate} userTimezone={timezone} />
            </div>
          )}

          {/* Add to Calendar Button */}
          <div className="flex gap-3">
            <button
              onClick={() => downloadICS({
                title: event.title,
                description: event.description || undefined,
                url: event.event_url || undefined,
                starts_at: event.starts_at,
                ends_at: event.ends_at || undefined,
                organizer: { name: creatorName },
              })}
              className="flex-1 py-3 px-4 bg-gold-500 hover:bg-gold-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>📅</span>
              <span>Add to Calendar (.ics)</span>
            </button>
            {event.event_url && (
              <a
                href={event.event_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 px-4 bg-mystic-blue hover:bg-mystic-blue/90 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>🚀</span>
                <span>Join Event</span>
              </a>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Delete Event?
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete &ldquo;{event.title}&rdquo;? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-medium rounded-lg transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
