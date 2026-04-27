'use client';

import { useCallback, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

export type RsvpResponse = 'yes' | 'interested' | 'no';

export interface RsvpSubmitInput {
  response: RsvpResponse;
  remindMe?: boolean;
  /**
   * When true, the route adds the Member's verified email to the
   * newsletter list (idempotent). Fire-and-forget on the server side —
   * this UI signal travels to the route which decides what to do.
   */
  subscribeToNewsletter?: boolean;
}

export interface RsvpSubmitResult {
  ok: boolean;
  status: number;
}

/**
 * Small hook that owns the network side of an RSVP change: POST to the route
 * and report ok/failure. Call sites own their optimistic UI and revert-on-
 * failure state, since those vary (popover vs. detail page, with/without an
 * upward onUpdate callback).
 */
export function useRsvpMutation(eventId: string) {
  const [pending, setPending] = useState(false);

  const submit = useCallback(
    async ({ response, remindMe, subscribeToNewsletter }: RsvpSubmitInput): Promise<RsvpSubmitResult> => {
      setPending(true);
      try {
        const body: Record<string, unknown> = { response };
        if (typeof remindMe === 'boolean') body.remindMe = remindMe;
        if (typeof subscribeToNewsletter === 'boolean') {
          body.subscribeToNewsletter = subscribeToNewsletter;
        }
        const res = await apiFetch(`/api/events/${eventId}/rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { ok: res.ok, status: res.status };
      } catch {
        return { ok: false, status: 0 };
      } finally {
        setPending(false);
      }
    },
    [eventId],
  );

  return { submit, pending };
}
