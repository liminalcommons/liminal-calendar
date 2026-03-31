'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import type { DisplayEvent } from '@/lib/display-event';
import {
  getUserTimezone,
  formatTimeInTimezone,
  formatDateInTimezone,
} from '@/lib/timezone-utils';
import { formatDuration } from '@/lib/calendar-utils';
import { downloadICS } from '@/lib/ics-generator';
import { apiFetch } from '@/lib/api-fetch';
import { EventRSVP } from './EventRSVP';

interface EventDetailViewProps {
  eventId: string;
}

// Map recurrenceRule to a human-readable badge
function recurrenceLabel(rule: string): string {
  switch (rule) {
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'fortnightly': return 'Fortnightly';
    case 'monthly': return 'Monthly';
    default: return rule;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function EventDetailView({ eventId }: EventDetailViewProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const user = session?.user as any;

  const [event, setEvent] = useState<DisplayEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('UTC');

  useEffect(() => {
    setTimezone(getUserTimezone());
  }, []);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const res = await apiFetch(`/api/events/${eventId}`);
        const data = await res.json();
        if (res.ok && (data.id || data.event?.id)) {
          // API returns the event directly (not nested under .event)
          setEvent(data.id ? data : data.event);
        } else {
          setError(data.error || 'Event not found');
        }
      } catch (e) {
        setError('Event not found');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId]);

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/events/${event.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
      } else {
        const data = await res.json();
        setDeleteError(data.error || 'Failed to delete event');
      }
    } catch (e) {
      setDeleteError('Failed to delete event');
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const isLoaded = status !== 'loading';
  const hyloId = user?.hyloId || user?.id;
  const role = user?.role || 'member';
  const isCreator = isLoaded && user && event && (
    String(hyloId) === String(event.creator_id) || role === 'admin'
  );
  const canEdit = isCreator;
  const canDelete = isCreator;

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-grove-border/40 rounded w-24" />
          <div className="h-64 bg-grove-border/40 rounded-xl" />
          <div className="h-8 bg-grove-border/40 rounded w-2/3" />
          <div className="h-4 bg-grove-border/40 rounded w-1/3" />
          <div className="h-24 bg-grove-border/40 rounded" />
        </div>
      </div>
    );
  }

  // 404 / error
  if (error || !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-6"
        >
          ← Back
        </Link>
        <div className="p-8 text-center bg-grove-surface border border-grove-border rounded-xl">
          <p className="text-grove-text-muted mb-4">{error || 'Event not found'}</p>
          <Link href="/" className="text-grove-accent hover:underline text-sm">
            ← Back to calendar
          </Link>
        </div>
      </div>
    );
  }

  const startDate = new Date(event.starts_at);
  const endDate = event.ends_at ? new Date(event.ends_at) : null;
  const duration = formatDuration(event.starts_at, event.ends_at);
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back navigation */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-6 transition-colors"
      >
        ← Back
      </button>

      {/* Hero image */}
      {event.imageUrl && (
        <div className="mb-6 rounded-xl overflow-hidden">
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full max-h-64 object-cover"
          />
        </div>
      )}

      <div className="bg-grove-surface border border-grove-border rounded-xl p-6 space-y-6">
        {/* Title + recurrence badge */}
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {event.recurrenceRule && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-grove-accent/10 text-grove-accent border border-grove-accent/20 font-medium">
                {recurrenceLabel(event.recurrenceRule)}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-serif text-grove-text leading-tight">
            {event.title}
          </h1>
        </div>

        {/* Host */}
        <div className="flex items-center gap-2">
          {event.creator_image ? (
            <img
              src={event.creator_image}
              alt={event.creator_name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-xs font-semibold select-none">
              {getInitials(event.creator_name)}
            </div>
          )}
          <span className="text-sm text-grove-text-muted">
            Hosted by <span className="text-grove-text font-medium">{event.creator_name}</span>
          </span>
        </div>

        {/* Date & time */}
        <div className="p-4 bg-grove-bg border border-grove-border rounded-lg space-y-1">
          <p className="text-sm font-semibold text-grove-text">
            {formatDateInTimezone(startDate, timezone)}
          </p>
          <p className="text-lg font-mono text-grove-text">
            {formatTimeInTimezone(startDate, timezone)}
            {endDate && ` – ${formatTimeInTimezone(endDate, timezone)}`}
          </p>
          {duration && (
            <p className="text-xs text-grove-text-muted">{duration}</p>
          )}
          <p className="text-xs text-grove-text-muted">
            Your timezone: {timezone.split('/').pop()?.replace(/_/g, ' ')}
          </p>

        </div>

        {/* Description */}
        {event.description && (
          <div>
            <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider mb-2">
              About
            </h2>
            <p className="text-grove-text whitespace-pre-wrap leading-relaxed">
              {event.description}
            </p>
          </div>
        )}

        {/* Meeting link */}
        {event.event_url && (
          <a
            href={event.event_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-grove-accent text-grove-surface rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Join Meeting →
          </a>
        )}

        {/* RSVP section */}
        <div className="pt-2 border-t border-grove-border">
          <EventRSVP eventId={event.id} initialResponse={event.myResponse} />
        </div>

        {/* Add to Calendar */}
        <button
          onClick={() =>
            downloadICS({
              title: event.title,
              description: event.description || undefined,
              url: event.event_url || undefined,
              starts_at: event.starts_at,
              ends_at: event.ends_at || undefined,
              organizer: { name: event.creator_name },
              recurrenceRule: event.recurrenceRule,
            })
          }
          className="w-full py-2.5 px-4 border border-grove-border text-grove-text text-sm font-medium rounded-lg hover:bg-grove-border/20 transition-colors"
        >
          Add to Calendar (.ics)
        </button>

        {/* Edit / Delete (creator only) */}
        {(canEdit || canDelete) && (
          <div className="flex gap-3 pt-2 border-t border-grove-border">
            {canEdit && (
              <Link
                href={`/events/${event.id}/edit`}
                className="flex-1 py-2 px-4 text-center text-sm font-medium border border-grove-border text-grove-text rounded-lg hover:bg-grove-border/20 transition-colors"
              >
                Edit Event
              </Link>
            )}
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex-1 py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Delete Event
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-grove-surface border border-grove-border rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-serif text-grove-text mb-2">
              Delete Event?
            </h3>
            <p className="text-sm text-grove-text-muted mb-6">
              Are you sure you want to delete &ldquo;{event.title}&rdquo;? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-500 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-medium rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 px-4 border border-grove-border text-grove-text rounded-lg hover:bg-grove-border/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
