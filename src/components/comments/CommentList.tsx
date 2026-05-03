'use client';

import React from 'react';

export interface CommentRow {
  id: number;
  authorId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
}

interface Props {
  comments: CommentRow[];
  currentUserId?: string | null;
  isAdmin?: boolean;
  onDelete?: (commentId: number) => void;
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function CommentList({ comments, currentUserId, isAdmin, onDelete }: Props) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-grove-text-muted italic py-4">
        No comments yet — be the first to say something.
      </p>
    );
  }

  return (
    <ul className="space-y-4 py-2">
      {comments.map((c) => {
        const canDelete =
          onDelete !== undefined && (isAdmin === true || c.authorId === currentUserId);
        return (
          <li key={c.id} className="flex gap-3">
            {c.authorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.authorImage}
                alt={c.authorName}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-grove-accent/20 flex items-center justify-center text-xs font-semibold text-grove-accent-deep flex-shrink-0">
                {initials(c.authorName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-grove-text">{c.authorName}</span>
                <span className="text-xs text-grove-text-muted">{relative(c.createdAt)}</span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete!(c.id)}
                    className="ml-auto text-xs text-grove-text-muted hover:text-red-400 transition-colors"
                    aria-label={`Delete comment from ${c.authorName}`}
                  >
                    delete
                  </button>
                )}
              </div>
              <p className="text-sm text-grove-text whitespace-pre-wrap break-words mt-0.5">
                {c.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
