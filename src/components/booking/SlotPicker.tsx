'use client';

/**
 * SlotPicker — client component for the public booking page
 * `/[handle]/[slug]`. Task 8 of Plan 3 (1:1 Booking).
 *
 * Lifecycle:
 *   1. GET  /api/booking/<handle>/<slug>/slots — render slots grouped by day.
 *   2. User clicks a slot button → POST /api/booking/<handle>/<slug>/book
 *      with `{ startsAt }`.
 *   3. 201 → confirmation card (title + local time + location link).
 *      409 → toast "That slot was just taken, refreshing…" then refetch.
 *      401 → redirect to /sign-in?next=<current path>.
 *
 * Time formatting uses Intl.DateTimeFormat in the user's local tz, so
 * day grouping respects the booker's wall-clock, not UTC.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface EventTypeMeta {
  id: number;
  title: string;
  durationMinutes: number;
  locationKind: 'castalia' | 'external_link' | 'in_person';
}

interface Slot {
  startsAt: string; // ISO
}

interface SlotsResponse {
  eventType: EventTypeMeta;
  slots: Slot[];
}

interface Booking {
  id: number;
  startsAt: string;
  endsAt: string;
  location: string | null;
  title: string;
}

export interface SlotPickerProps {
  handle: string;
  slug: string;
  isAuthed?: boolean;
  /** Display name of the owner — used to contextualize the anon CTA. */
  ownerLabel?: string;
}

const dayKeyFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function groupByDay(slots: Slot[]): Array<{ key: string; slots: Slot[] }> {
  const out: Array<{ key: string; slots: Slot[] }> = [];
  const byKey = new Map<string, Slot[]>();
  for (const s of slots) {
    const d = new Date(s.startsAt);
    const key = dayKeyFmt.format(d);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
      out.push({ key, slots: bucket });
    }
    bucket.push(s);
  }
  return out;
}

function isExternalLocation(location: string | null): boolean {
  if (!location) return false;
  return /^https?:\/\//i.test(location);
}

export function SlotPicker({ handle, slug, isAuthed = true, ownerLabel }: SlotPickerProps) {
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState<EventTypeMeta | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bookingInFlight, setBookingInFlight] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(`/api/booking/${handle}/${slug}/slots`);
      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = `/sign-in?next=/${handle}/${slug}`;
        }
        return;
      }
      if (res.status === 404) {
        setError('This booking page is no longer available.');
        return;
      }
      if (!res.ok) {
        setError('Could not load available times.');
        return;
      }
      const data = (await res.json()) as SlotsResponse;
      setEventType(data.eventType);
      setSlots(data.slots ?? []);
    } catch {
      setError('Network error — please retry.');
    } finally {
      setLoading(false);
    }
  }, [handle, slug]);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    void fetchSlots();
  }, [fetchSlots, isAuthed]);

  async function bookSlot(startsAt: string) {
    setBookingInFlight(startsAt);
    setToast(null);
    try {
      const res = await apiFetch(`/api/booking/${handle}/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt }),
      });
      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = `/sign-in?next=/${handle}/${slug}`;
        }
        return;
      }
      if (res.status === 409) {
        setToast('That slot was just taken, refreshing…');
        await fetchSlots();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setToast(body.error ?? 'Could not complete booking.');
        return;
      }
      const data = (await res.json()) as Booking;
      setConfirmed(data);
    } catch {
      setToast('Network error — please retry.');
    } finally {
      setBookingInFlight(null);
    }
  }

  if (!isAuthed) {
    const next = `/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`;
    const whose = ownerLabel ? `${ownerLabel}'s` : 'available';
    return (
      <div className="rounded border border-grove-border bg-grove-bg p-4 space-y-3">
        <p className="text-sm text-grove-text">
          Sign in to see {whose} open times and book a 1:1.
        </p>
        <a
          href={`/welcome?next=${encodeURIComponent(next)}`}
          className="inline-flex items-center px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
        >
          {ownerLabel ? `Sign in to book with ${ownerLabel}` : 'Sign in to book'}
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div role="status" className="text-sm text-grove-text-muted">
        Loading times…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (confirmed) {
    const start = new Date(confirmed.startsAt);
    const end = new Date(confirmed.endsAt);
    const dayLabel = dayKeyFmt.format(start);
    const timeLabel = `${timeFmt.format(start)} – ${timeFmt.format(end)}`;
    return (
      <div
        role="status"
        className="rounded border border-grove-border bg-grove-bg p-4 space-y-2"
      >
        <h2 className="text-lg font-semibold text-grove-text">
          You&apos;re booked.
        </h2>
        <p className="text-sm text-grove-text">{confirmed.title}</p>
        <p className="text-sm text-grove-text-muted">
          {dayLabel} · {timeLabel}
        </p>
        {confirmed.location && isExternalLocation(confirmed.location) && (
          <p className="text-sm">
            <a
              href={confirmed.location}
              className="text-grove-accent underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join link
            </a>
          </p>
        )}
        {confirmed.location && !isExternalLocation(confirmed.location) && (
          <p className="text-sm text-grove-text-muted">
            Location: <span className="font-mono">{confirmed.location}</span>
          </p>
        )}
        <p className="text-xs text-grove-text-muted">
          A confirmation is in your inbox.
        </p>
      </div>
    );
  }

  const grouped = groupByDay(slots);

  return (
    <div className="space-y-6">
      {eventType && (
        <div className="text-sm text-grove-text-muted">
          {eventType.durationMinutes} min · {eventType.title}
        </div>
      )}

      {toast && (
        <div role="status" className="text-sm text-amber-700">
          {toast}
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-grove-text-muted">
          No times available — try again later.
        </p>
      ) : (
        grouped.map(({ key, slots: daySlots }) => (
          <section key={key} className="space-y-2">
            <h3 className="text-sm font-semibold text-grove-text">{key}</h3>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  onClick={() => void bookSlot(s.startsAt)}
                  disabled={bookingInFlight !== null}
                  className="px-3 py-1.5 rounded border border-grove-border bg-grove-bg text-sm text-grove-text hover:bg-grove-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {bookingInFlight === s.startsAt
                    ? 'Booking…'
                    : timeFmt.format(new Date(s.startsAt))}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
