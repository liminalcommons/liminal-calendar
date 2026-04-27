'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

type Status =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ok'; message: string }
  | { kind: 'needs_both_sessions' }
  | { kind: 'needs_merge'; hyloMemberId: number; clerkMemberId: number }
  | { kind: 'error'; message: string };

/**
 * Profile-page button for linking the user's Hylo and Clerk identities
 * onto a single Member row.
 *
 * The /api/account/link-clerk endpoint requires BOTH Hylo and Clerk
 * session cookies. The button doesn't gate visibility on local session
 * state (which provider the calendar is currently authed via) — instead
 * it dispatches and surfaces the API's structured response. Users who
 * haven't completed the second sign-in see a clear "needs_both_sessions"
 * state, which acts as both error and instruction.
 */
export function LinkClerkButton() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleClick() {
    setStatus({ kind: 'pending' });
    try {
      const res = await apiFetch('/api/account/link-clerk', { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setStatus({ kind: 'needs_both_sessions' });
        return;
      }
      if (res.status === 409 && typeof body.hyloMemberId === 'number' && typeof body.clerkMemberId === 'number') {
        setStatus({
          kind: 'needs_merge',
          hyloMemberId: body.hyloMemberId,
          clerkMemberId: body.clerkMemberId,
        });
        return;
      }
      if (res.ok) {
        const messages: Record<string, string> = {
          already_linked: 'Your Hylo and Clerk identities are already linked.',
          clerk_attached: 'Linked your Clerk identity to your account.',
          hylo_attached: 'Linked your Hylo identity to your account.',
        };
        const message = messages[body.status as string] ?? 'Accounts linked.';
        setStatus({ kind: 'ok', message });
        return;
      }
      setStatus({
        kind: 'error',
        message: body.error ?? `Unexpected response (${res.status})`,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={status.kind === 'pending'}
        className="px-4 py-2 rounded-lg border border-grove-border bg-grove-surface text-sm font-medium
                   text-grove-text hover:bg-grove-border/30 transition-colors disabled:opacity-50"
      >
        {status.kind === 'pending' ? 'Linking…' : 'Link Hylo + Clerk accounts'}
      </button>
      {status.kind === 'ok' && (
        <p className="text-xs text-grove-accent">{status.message}</p>
      )}
      {status.kind === 'needs_both_sessions' && (
        <p className="text-xs text-grove-text-muted">
          You need to be signed in via BOTH Hylo and Clerk before linking. Complete the second sign-in, then click this button again.
        </p>
      )}
      {status.kind === 'needs_merge' && (
        <p className="text-xs text-grove-text-muted">
          Both Hylo and Clerk map to distinct Member records (#{status.hyloMemberId} and #{status.clerkMemberId}). An admin merge is required.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="text-xs text-red-500">{status.message}</p>
      )}
    </div>
  );
}
