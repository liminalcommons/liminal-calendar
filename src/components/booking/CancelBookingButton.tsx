'use client';

/**
 * CancelBookingButton — one button used in three surfaces (booking
 * confirmation card, /events/[id], /book upcoming list). Clicking it
 * expands an inline confirm panel with an optional reason textarea,
 * then PATCHes /api/booking/events/<id>/cancel.
 *
 * Calls onCancelled when the server returns 200 so the parent can
 * locally reflect the cancelled state (no full router refresh needed).
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

interface Props {
  eventId: number;
  /** Optional copy override for the trigger button. */
  triggerLabel?: string;
  /** Compact mode: trigger is a small text-style link. */
  size?: 'default' | 'compact';
  onCancelled?: () => void;
}

export function CancelBookingButton({
  eventId,
  triggerLabel = 'Cancel this booking',
  size = 'default',
  onCancelled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/booking/events/${eventId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() ? reason.trim() : undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) setError('Sign in again to cancel.');
        else if (res.status === 403) setError('Only the host or booker can cancel.');
        else if (res.status === 404) setError('This booking no longer exists.');
        else setError(data.error ?? 'Could not cancel.');
        return;
      }
      setDone(true);
      onCancelled?.();
    } catch {
      setError('Network error — please retry.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-xs text-grove-text-muted">
        Cancellation recorded. The other party has been notified.
      </p>
    );
  }

  if (!open) {
    const triggerClass =
      size === 'compact'
        ? 'inline-flex items-center gap-1 text-xs text-grove-text-muted hover:text-red-700 transition-colors'
        : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-grove-border text-sm text-grove-text hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors';
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        <X size={size === 'compact' ? 11 : 13} aria-hidden="true" />
        {triggerLabel}
      </button>
    );
  }

  return (
    <div className="rounded border border-grove-border bg-grove-surface p-3 space-y-2">
      <p className="text-sm font-medium text-grove-text">Cancel this booking?</p>
      <p className="text-xs text-grove-text-muted">
        The other party will be notified by email and in their inbox.
      </p>
      <label className="block">
        <span className="text-xs text-grove-text-muted">Reason (optional, shared with the other party)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Something came up — happy to reschedule."
          className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
        />
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setReason(''); setError(null); }}
          className="text-xs text-grove-text-muted hover:text-grove-text"
        >
          Keep meeting
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Cancelling…' : 'Confirm cancel'}
        </button>
      </div>
    </div>
  );
}
