'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api-fetch';

interface Props {
  eventId: number;
  startsAt: string | null;
  endsAt: string | null;
}

interface ReportRow {
  id: number;
  eventId: number;
  reporterId: string;
  eventHappened: boolean;
  hostPresent: boolean;
  note: string | null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function eventHasEnded(startsAt: string | null, endsAt: string | null): boolean {
  if (endsAt) return Date.now() >= new Date(endsAt).getTime();
  if (startsAt) return Date.now() >= new Date(startsAt).getTime() + ONE_HOUR_MS;
  return false;
}

type Answer = 'yes' | 'no' | null;

function answerOf(b: boolean | undefined | null): Answer {
  if (b === true) return 'yes';
  if (b === false) return 'no';
  return null;
}

export function AttendanceReportSection({ eventId, startsAt, endsAt }: Props) {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const ended = eventHasEnded(startsAt, endsAt);

  const shouldRender = isAuthenticated && ended;

  const [happened, setHappened] = useState<Answer>(null);
  const [hostThere, setHostThere] = useState<Answer>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hadInitialReport, setHadInitialReport] = useState(false);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    apiFetch(`/api/events/${eventId}/attendance-report`, { method: 'GET' })
      .then((r) => (r.ok ? r.json() : { report: null }))
      .then((data: { report: ReportRow | null }) => {
        if (cancelled) return;
        if (data.report) {
          setHappened(answerOf(data.report.eventHappened));
          setHostThere(answerOf(data.report.hostPresent));
          setNote(data.report.note ?? '');
          setHadInitialReport(true);
        }
      })
      .catch(() => {
        // best-effort; leave defaults
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, shouldRender]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (happened === null || hostThere === null || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/events/${eventId}/attendance-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventHappened: happened === 'yes',
            hostPresent: hostThere === 'yes',
            note: note.trim() || null,
          }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          setError(payload.error ?? 'Failed to save report');
          return;
        }
        setSubmitted(true);
      } catch {
        setError('Network error — please try again');
      } finally {
        setSubmitting(false);
      }
    },
    [eventId, happened, hostThere, note, submitting],
  );

  if (!shouldRender) return null;

  return (
    <section aria-labelledby="attendance-report-heading" className="mt-8">
      <h2
        id="attendance-report-heading"
        className="text-lg font-serif text-grove-text mb-2"
      >
        How did it go?
      </h2>
      <p className="text-xs text-grove-text-muted mb-4">
        Help others know if this event actually happened. Your report is visible only to admins.
      </p>

      {submitted ? (
        <p
          role="status"
          className="text-sm text-grove-accent-deep bg-grove-accent/10 border border-grove-accent/30 rounded-lg px-3 py-2"
        >
          Thanks for reporting — you can update your answers any time.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-grove-text">
              Did this event happen?
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-grove-text">
                <input
                  type="radio"
                  name="eventHappened"
                  value="yes"
                  checked={happened === 'yes'}
                  onChange={() => setHappened('yes')}
                  className="accent-grove-accent"
                />
                Yes
              </label>
              <label className="flex items-center gap-2 text-sm text-grove-text">
                <input
                  type="radio"
                  name="eventHappened"
                  value="no"
                  checked={happened === 'no'}
                  onChange={() => setHappened('no')}
                  className="accent-grove-accent"
                />
                No
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-grove-text">
              Was the host actually there?
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-grove-text">
                <input
                  type="radio"
                  name="hostPresent"
                  value="yes"
                  checked={hostThere === 'yes'}
                  onChange={() => setHostThere('yes')}
                  className="accent-grove-accent"
                />
                Yes
              </label>
              <label className="flex items-center gap-2 text-sm text-grove-text">
                <input
                  type="radio"
                  name="hostPresent"
                  value="no"
                  checked={hostThere === 'no'}
                  onChange={() => setHostThere('no')}
                  className="accent-grove-accent"
                />
                No
              </label>
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="report-note"
              className="block text-sm font-medium text-grove-text mb-1"
            >
              Note <span className="text-grove-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Anything admins should know?"
              className="w-full bg-grove-surface border border-grove-border rounded-lg px-3 py-2 text-sm text-grove-text placeholder:text-grove-text-muted focus:outline-none focus:ring-1 focus:ring-grove-accent resize-y"
            />
            <p className="text-xs text-grove-text-muted text-right mt-1">
              {note.length}/1000
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={happened === null || hostThere === null || submitting}
            className="px-3 py-1.5 text-sm rounded-md bg-grove-accent/20 text-grove-accent-deep border border-grove-accent/30 hover:bg-grove-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting…' : hadInitialReport ? 'Update' : 'Submit'}
          </button>
        </form>
      )}
    </section>
  );
}
