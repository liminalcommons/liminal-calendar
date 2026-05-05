'use client';

import React, { useEffect, useRef } from 'react';

export type RecurrenceMoveScope = 'this_only' | 'this_and_following' | 'all';

interface RecurrenceMoveModalProps {
  isOpen: boolean;
  /** Event title shown in the dialog heading so the user knows what they're moving. */
  eventTitle: string;
  /** Called with the chosen scope when user confirms. v1: only `'all'` is enabled. */
  onConfirm: (scope: RecurrenceMoveScope) => void;
  onCancel: () => void;
}

const TITLE_ID = 'recurrence-move-modal-title';

/**
 * Confirmation modal that intercepts a drag-drop on a recurring event.
 * Shows three scope options matching the RSVP pattern (this / this and
 * following / all) but disables the first two in v1 — implementing them
 * requires a recurrence exception model that's out of scope for this slice.
 *
 * Closes on Escape and on backdrop click.
 */
export function RecurrenceMoveModal({
  isOpen,
  eventTitle,
  onConfirm,
  onCancel,
}: RecurrenceMoveModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => {
        // Backdrop click cancels; clicks inside the dialog stop propagation below.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="bg-grove-surface border border-grove-border rounded-xl p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={TITLE_ID}
          className="text-lg font-serif font-semibold text-grove-text mb-1"
        >
          Move recurring event
        </h2>
        <p className="text-sm text-grove-text-muted mb-4">
          &ldquo;{eventTitle}&rdquo; — choose how the move should apply.
        </p>

        <fieldset className="space-y-2 mb-5">
          <label className="flex items-start gap-2 text-sm text-grove-text-muted opacity-50 cursor-not-allowed">
            <input
              type="radio"
              name="scope"
              value="this_only"
              disabled
              className="mt-1"
            />
            <span>
              <span className="font-medium">This event only</span>
              <span className="block text-xs">Coming soon — needs single-instance overrides.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-grove-text-muted opacity-50 cursor-not-allowed">
            <input
              type="radio"
              name="scope"
              value="this_and_following"
              disabled
              className="mt-1"
            />
            <span>
              <span className="font-medium">This and following</span>
              <span className="block text-xs">Coming soon — needs rule split.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-grove-text cursor-pointer">
            <input
              type="radio"
              name="scope"
              value="all"
              defaultChecked
              className="mt-1"
            />
            <span>
              <span className="font-medium">All events</span>
              <span className="block text-xs text-grove-text-muted">Shifts the whole series by the same delta.</span>
            </span>
          </label>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onConfirm('all')}
            className="flex-1 py-2 px-4 bg-grove-accent text-grove-surface text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            Confirm move
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-4 border border-grove-border text-grove-text text-sm rounded-lg hover:bg-grove-border/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
