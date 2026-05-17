'use client';

/**
 * SlotPicker — public booking page time selection.
 *
 * Two-pane UX: a horizontal day strip on top, time list for the
 * selected day below. Calendly-style — never shows a flat dump of
 * every available time across every future day. Default selection is
 * the first day with availability. The user's IANA timezone is shown
 * at the top so they always know which clock the times are on.
 *
 * Lifecycle:
 *   1. GET  /api/booking/<handle>/<slug>/slots → render dayStrip + slots
 *   2. POST /api/booking/<handle>/<slug>/book with `{ startsAt }`
 *   3. 201 → confirmation card. 409 → toast + refetch. 401 → /sign-in.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { CancelBookingButton } from './CancelBookingButton';

interface EventTypeMeta {
  id: number;
  title: string;
  durationMinutes: number;
  locationKind: 'castalia' | 'external_link' | 'in_person';
}

interface Slot {
  startsAt: string;
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
  ownerLabel?: string;
}

const dayLongFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}); // YYYY-MM-DD in user's tz

const dayWeekShortFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dayMonthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
const dayNumberFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

interface DayBucket {
  key: string;
  date: Date;
  slots: Slot[];
}

function bucketByDay(slots: Slot[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const s of slots) {
    const d = new Date(s.startsAt);
    const key = dayKeyFmt.format(d);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), slots: [] };
      map.set(key, bucket);
    }
    bucket.slots.push(s);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function isExternalLocation(location: string | null): boolean {
  if (!location) return false;
  return /^https?:\/\//i.test(location);
}

function userTimezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function SlotPicker({ handle, slug, isAuthed = true, ownerLabel }: SlotPickerProps) {
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState<EventTypeMeta | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bookingInFlight, setBookingInFlight] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDayOverride, setSelectedDayOverride] = useState<string | null>(null);
  // Two-step flow state: when the user picks a time pill we move into
  // 'review' with that slot, an optional note, and an explicit
  // "Confirm booking" button. Clicking Back returns to 'pick'.
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');

  const tzLabel = useMemo(userTimezoneLabel, []);
  const days = useMemo(() => bucketByDay(slots), [slots]);

  // Effective selection: user's clicked-on day if still available, else
  // the first day with slots. Derived (not state) so rendering is
  // consistent with the latest `days` snapshot — no re-render race.
  const selectedDay = useMemo<string | null>(() => {
    if (days.length === 0) return null;
    if (selectedDayOverride && days.some((d) => d.key === selectedDayOverride)) {
      return selectedDayOverride;
    }
    return days[0].key;
  }, [days, selectedDayOverride]);

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
      const trimmedNote = note.trim();
      const res = await apiFetch(`/api/booking/${handle}/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          trimmedNote ? { startsAt, note: trimmedNote } : { startsAt },
        ),
      });
      if (res.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = `/sign-in?next=/${handle}/${slug}`;
        }
        return;
      }
      if (res.status === 409) {
        setToast('That slot was just taken — refreshing…');
        // Drop back to the picker so the (now-stale) selection isn't
        // still on screen, and refetch the latest slots.
        setPendingSlot(null);
        setNote('');
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
    const dayLabel = dayLongFmt.format(start);
    const timeLabel = `${timeFmt.format(start)} – ${timeFmt.format(end)}`;
    return (
      <div
        role="status"
        className="rounded border border-grove-border bg-grove-bg p-4 space-y-3"
      >
        <h2 className="text-lg font-semibold text-grove-text">
          {cancelled ? 'Booking cancelled.' : "You're booked."}
        </h2>
        <p className="text-sm text-grove-text">{confirmed.title}</p>
        <p className={`text-sm text-grove-text-muted ${cancelled ? 'line-through' : ''}`}>
          {dayLabel} · {timeLabel}
        </p>
        {!cancelled && confirmed.location && isExternalLocation(confirmed.location) && (
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
        {!cancelled && confirmed.location && !isExternalLocation(confirmed.location) && (
          <p className="text-sm text-grove-text-muted">
            Location: <span className="font-mono">{confirmed.location}</span>
          </p>
        )}
        {!cancelled && (
          <p className="text-xs text-grove-text-muted">A confirmation is in your inbox.</p>
        )}
        {!cancelled && (
          <div className="pt-1">
            <CancelBookingButton
              eventId={confirmed.id}
              triggerLabel="Cancel this booking"
              onCancelled={() => setCancelled(true)}
            />
          </div>
        )}
      </div>
    );
  }

  const selectedBucket = days.find((d) => d.key === selectedDay) ?? null;

  // Step 2: review the chosen slot, optionally leave a note, confirm.
  if (pendingSlot && eventType) {
    const pendingDate = new Date(pendingSlot.startsAt);
    const pendingDay = dayLongFmt.format(pendingDate);
    const pendingTime = timeFmt.format(pendingDate);
    const pendingEndsAt = new Date(
      pendingDate.getTime() + eventType.durationMinutes * 60_000,
    );
    const pendingEndTime = timeFmt.format(pendingEndsAt);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setPendingSlot(null); setNote(''); setToast(null); }}
          disabled={bookingInFlight !== null}
          className="inline-flex items-center gap-1 text-xs text-grove-text-muted hover:text-grove-text disabled:opacity-40"
        >
          <ArrowLeft size={12} aria-hidden="true" />
          Pick a different time
        </button>

        <div className="rounded border border-grove-border bg-grove-bg p-4 space-y-3">
          <div>
            <p className="text-xs text-grove-text-muted">
              {eventType.durationMinutes} min · {eventType.title}
              <span className="ml-2 opacity-70">{tzLabel}</span>
            </p>
            <p className="text-base font-semibold text-grove-text mt-1">{pendingDay}</p>
            <p className="text-sm text-grove-text">
              {pendingTime} – {pendingEndTime}
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-grove-text">
              Note (optional, shared with {ownerLabel ?? 'the host'})
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What would you like to talk about? Any context that helps?"
              className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
            />
            <span className="block text-[10px] text-grove-text-muted mt-0.5">
              Included in the host&apos;s confirmation email. They&apos;ll see your note before the meeting.
            </span>
          </label>

          {toast && (
            <div role="status" className="text-sm text-amber-700">
              {toast}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setPendingSlot(null); setNote(''); setToast(null); }}
              disabled={bookingInFlight !== null}
              className="text-xs text-grove-text-muted hover:text-grove-text disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void bookSlot(pendingSlot.startsAt)}
              disabled={bookingInFlight !== null}
              className="px-4 py-2 rounded bg-grove-accent text-white text-sm font-medium hover:bg-grove-accent-deep disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bookingInFlight === pendingSlot.startsAt ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {eventType && (
        <div className="flex items-center justify-between gap-2 text-xs text-grove-text-muted">
          <span>
            {eventType.durationMinutes} min · {eventType.title}
          </span>
          <span aria-label="Your timezone" title={tzLabel}>
            {tzLabel}
          </span>
        </div>
      )}

      {toast && (
        <div role="status" className="text-sm text-amber-700">
          {toast}
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-grove-text-muted">
          No open times in the booking window. Try again later.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,1fr)]">
          {/* Day strip */}
          <div className="space-y-2">
            <p className="text-xs text-grove-text-muted">Pick a day</p>
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:max-h-[420px] md:overflow-y-auto pb-1 md:pb-0 md:pr-1">
              {days.map((d) => {
                const isActive = d.key === selectedDay;
                return (
                  <button
                    key={d.key}
                    type="button"
                    data-testid="day-pill"
                    onClick={() => setSelectedDayOverride(d.key)}
                    className={[
                      'shrink-0 md:shrink min-w-[68px] md:min-w-0 md:w-full px-3 py-2 rounded border text-left transition-colors flex md:items-center gap-1 md:gap-2 flex-col md:flex-row',
                      isActive
                        ? 'border-grove-accent bg-grove-accent text-white'
                        : 'border-grove-border bg-grove-bg text-grove-text hover:bg-grove-surface',
                    ].join(' ')}
                    aria-pressed={isActive}
                  >
                    <span className="text-[10px] uppercase tracking-wide opacity-70 md:opacity-80">
                      {dayWeekShortFmt.format(d.date)}
                    </span>
                    <span className="text-base font-semibold leading-none md:leading-tight">
                      {dayMonthFmt.format(d.date)} {dayNumberFmt.format(d.date)}
                    </span>
                    <span className="text-[10px] opacity-70 md:ml-auto">
                      {d.slots.length} slot{d.slots.length === 1 ? '' : 's'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time list for selected day */}
          <div className="space-y-2 min-h-[180px]">
            {selectedBucket ? (
              <>
                <p className="text-xs text-grove-text-muted">
                  {dayLongFmt.format(selectedBucket.date)}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {selectedBucket.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      data-testid="time-slot"
                      onClick={() => { setPendingSlot(s); setToast(null); }}
                      disabled={bookingInFlight !== null}
                      className="px-3 py-2 rounded border border-grove-border bg-grove-bg text-sm text-grove-text hover:bg-grove-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {timeFmt.format(new Date(s.startsAt))}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-grove-text-muted">Pick a day to see open times.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
