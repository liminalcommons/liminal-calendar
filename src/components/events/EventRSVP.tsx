'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { calendarSFX } from '@/lib/sound-manager';
import { apiFetch } from '@/lib/api-fetch';
import { useRsvpMutation } from '@/lib/rsvp/use-rsvp-mutation';

interface AttendeeItem {
  id?: string;
  person: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  response: string;
  remindMe?: boolean;
}

interface EventRSVPProps {
  eventId: string;
  initialResponse?: string | null;
}

// Generate a deterministic color from a string (for avatar initials)
function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-grove-accent',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-sky-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function AttendeeChip({ attendee, badge }: { attendee: AttendeeItem; badge: string }) {
  const initials = getInitials(attendee.person.name);
  const bgColor = hashColor(attendee.person.id);

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-grove-surface border border-grove-border rounded-full">
      {attendee.person.avatarUrl ? (
        <img
          src={attendee.person.avatarUrl}
          alt={attendee.person.name}
          className="w-5 h-5 rounded-full object-cover"
        />
      ) : (
        <div
          className={`w-5 h-5 rounded-full ${bgColor} flex items-center justify-center text-white text-[9px] font-bold select-none`}
        >
          {initials}
        </div>
      )}
      <span className="text-xs text-grove-text">{attendee.person.name}</span>
      <span className="text-[9px] text-grove-text-muted">{badge}</span>
    </div>
  );
}

export function EventRSVP({ eventId, initialResponse }: EventRSVPProps) {
  const { data: session, status } = useSession();
  const isSignedIn = status === 'authenticated';

  const [attendees, setAttendees] = useState<AttendeeItem[]>([]);
  const [currentResponse, setCurrentResponse] = useState<string | null>(initialResponse ?? null);
  const [loading, setLoading] = useState(true);
  const [remindMe, setRemindMe] = useState(true);
  // Newsletter opt-in. Default false — opt-in must be deliberate. The
  // server is idempotent on the unique-email constraint, so re-checking
  // is a safe no-op.
  const [subscribeNewsletter, setSubscribeNewsletter] = useState(false);
  const { submit: submitRsvp, pending: updating } = useRsvpMutation(eventId);

  async function fetchAttendees() {
    try {
      const res = await apiFetch(`/api/events/${eventId}/rsvp`);
      if (res.ok) {
        const data = await res.json();
        const items: AttendeeItem[] = data.invitations?.items ?? [];
        setAttendees(items);
        const user = session?.user;
        const myUserId = user?.hyloId ?? user?.id;
        if (myUserId) {
          const myRsvp = items.find((a: any) => a.person.id === myUserId);
          if (myRsvp) setRemindMe((myRsvp as any).remindMe ?? false);
        }
      }
    } catch (e) {
      console.error('Failed to fetch attendees:', e);
    }
  }

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchAttendees().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isSignedIn]);

  async function handleRSVP(response: 'yes' | 'interested' | 'no') {
    if (!isSignedIn) return;
    const prev = currentResponse;
    setCurrentResponse(response === 'no' ? null : response);

    const result = await submitRsvp({
      response,
      remindMe: response === 'no' ? false : remindMe,
      // Only meaningful on yes/interested — server ignores when false anyway.
      subscribeToNewsletter: response === 'no' ? false : subscribeNewsletter,
    });
    if (result.ok) {
      calendarSFX.play('shimmer');
      await fetchAttendees();
    } else {
      setCurrentResponse(prev);
    }
  }

  async function handleToggleRemind() {
    const next = !remindMe;
    setRemindMe(next);
    if (currentResponse && currentResponse !== 'no') {
      await submitRsvp({
        response: currentResponse as 'yes' | 'interested',
        remindMe: next,
      });
    }
  }

  async function handleToggleNewsletter() {
    const next = !subscribeNewsletter;
    setSubscribeNewsletter(next);
    // Only POST when toggling ON — opt-in is one-way (no unsubscribe API
    // here yet; that's S5 part 5+). Re-checking is a server-side no-op via
    // the unique-email constraint.
    if (next && currentResponse && currentResponse !== 'no') {
      await submitRsvp({
        response: currentResponse as 'yes' | 'interested',
        remindMe,
        subscribeToNewsletter: true,
      });
    }
  }

  const goingAttendees = attendees.filter(a => a.response === 'yes');
  const interestedAttendees = attendees.filter(a => a.response === 'interested');

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider">
        Who&apos;s Coming?
      </h2>

      {/* Counts */}
      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-grove-accent inline-block" />
          <span className="text-grove-text-muted">{goingAttendees.length} going</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          <span className="text-grove-text-muted">{interestedAttendees.length} interested</span>
        </span>
      </div>

      {/* Attendee lists */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 bg-grove-border/40 rounded-full w-32 animate-pulse" />
          <div className="h-8 bg-grove-border/40 rounded-full w-24 animate-pulse" />
        </div>
      ) : (
        <>
          {goingAttendees.length > 0 && (
            <div>
              <p className="text-xs text-grove-text-muted mb-2">Going:</p>
              <div className="flex flex-wrap gap-2">
                {goingAttendees.map((a, i) => (
                  <AttendeeChip key={a.id ?? i} attendee={a} badge="Going" />
                ))}
              </div>
            </div>
          )}

          {interestedAttendees.length > 0 && (
            <div>
              <p className="text-xs text-grove-text-muted mb-2">Interested:</p>
              <div className="flex flex-wrap gap-2">
                {interestedAttendees.map((a, i) => (
                  <AttendeeChip key={a.id ?? i} attendee={a} badge="Interested" />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* RSVP buttons */}
      {!isSignedIn ? (
        <p className="text-sm text-grove-text-muted">Sign in to RSVP for this event.</p>
      ) : (
        <>
        <div className="flex flex-wrap gap-2">
          {/* Going */}
          <button
            onClick={() => handleRSVP('yes')}
            disabled={updating}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              currentResponse === 'yes'
                ? 'bg-grove-accent text-grove-surface'
                : 'bg-grove-surface border border-grove-border text-grove-text hover:bg-grove-accent/10'
            }`}
          >
            {currentResponse === 'yes' ? "I'm Going!" : "Going"}
          </button>

          {/* Interested */}
          <button
            onClick={() => handleRSVP('interested')}
            disabled={updating}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              currentResponse === 'interested'
                ? 'bg-emerald-600 text-white'
                : 'bg-grove-surface border border-grove-border text-grove-text hover:bg-emerald-50'
            }`}
          >
            Interested
          </button>

          {/* Cancel — only shown when user has a response */}
          {currentResponse && (
            <button
              onClick={() => handleRSVP('no')}
              disabled={updating}
              className="px-4 py-2 rounded-lg text-sm font-medium text-grove-text-muted hover:text-red-500 border border-grove-border bg-grove-surface transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>

        {currentResponse && currentResponse !== 'no' && (
          <>
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remindMe}
                onChange={handleToggleRemind}
                className="w-4 h-4 rounded border-grove-border text-grove-accent focus:ring-grove-accent"
              />
              <span className="text-xs text-grove-text-muted">
                Remind me (1h, 15min, at start)
              </span>
            </label>
            <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={subscribeNewsletter}
                onChange={handleToggleNewsletter}
                className="w-4 h-4 rounded border-grove-border text-grove-accent focus:ring-grove-accent"
              />
              <span className="text-xs text-grove-text-muted">
                Subscribe to the monthly newsletter
              </span>
            </label>
          </>
        )}
        </>
      )}
    </div>
  );
}
