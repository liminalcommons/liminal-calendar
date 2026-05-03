'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import { CommentList, type CommentRow } from './CommentList';

interface Props {
  eventId: number;
}

export function CommentSection({ eventId }: Props) {
  const { data: session, status } = useSession();
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // session.user.hyloId / clerkId may be present depending on provider
  type SessionUser = {
    name?: string | null;
    hyloId?: string | null;
    clerkId?: string | null;
    role?: string;
  };
  const user = (session?.user ?? null) as SessionUser | null;
  const isAuthenticated = status === 'authenticated';
  const isAdmin = user?.role === 'admin';
  const currentUserId = user?.hyloId ?? user?.clerkId ?? null;

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/events/${eventId}/comments`, { method: 'GET' })
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((data: { comments: CommentRow[] }) => {
        if (!cancelled) setComments(data.comments ?? []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (text.length === 0 || posting) return;
      setPosting(true);
      setPostError(null);
      try {
        const res = await apiFetch(`/api/events/${eventId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setPostError(err.error ?? 'Failed to post comment');
          return;
        }
        const { comment } = (await res.json()) as { comment: CommentRow };
        setComments((prev) => [...(prev ?? []), comment]);
        setDraft('');
      } catch {
        setPostError('Network error — please try again');
      } finally {
        setPosting(false);
      }
    },
    [draft, eventId, posting],
  );

  const handleDelete = useCallback(
    async (commentId: number) => {
      // Optimistic remove
      setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
      try {
        const res = await apiFetch(
          `/api/events/${eventId}/comments/${commentId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          // Rollback on failure — refetch to be safe.
          const r2 = await apiFetch(`/api/events/${eventId}/comments`);
          const data = (await r2.json()) as { comments: CommentRow[] };
          setComments(data.comments ?? []);
        }
      } catch {
        // best-effort rollback
        const r2 = await apiFetch(`/api/events/${eventId}/comments`);
        const data = (await r2.json().catch(() => ({ comments: [] }))) as {
          comments: CommentRow[];
        };
        setComments(data.comments ?? []);
      }
    },
    [eventId],
  );

  if (comments === null) {
    return (
      <section aria-labelledby="comments-heading" className="mt-8">
        <h2
          id="comments-heading"
          className="text-lg font-serif text-grove-text mb-2"
        >
          Comments
        </h2>
        <p className="text-sm text-grove-text-muted italic">Loading…</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="comments-heading" className="mt-8">
      <h2
        id="comments-heading"
        className="text-lg font-serif text-grove-text mb-2"
      >
        Comments
      </h2>

      <CommentList
        comments={comments}
        currentUserId={currentUserId ?? undefined}
        isAdmin={isAdmin}
        onDelete={handleDelete}
      />

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-2">
          <label htmlFor="comment-body" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            maxLength={2000}
            className="w-full bg-grove-surface border border-grove-border rounded-lg px-3 py-2 text-sm text-grove-text placeholder:text-grove-text-muted focus:outline-none focus:ring-1 focus:ring-grove-accent resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            {postError ? (
              <span role="alert" className="text-xs text-red-400">
                {postError}
              </span>
            ) : (
              <span className="text-xs text-grove-text-muted">
                {draft.length}/2000
              </span>
            )}
            <button
              type="submit"
              disabled={draft.trim().length === 0 || posting}
              className="px-3 py-1.5 text-sm rounded-md bg-grove-accent/20 text-grove-accent-deep border border-grove-accent/30 hover:bg-grove-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-grove-text-muted">
          <Link
            href="/api/auth/signin"
            className="text-grove-accent-deep hover:underline"
          >
            Sign in to comment
          </Link>
          .
        </p>
      )}
    </section>
  );
}
