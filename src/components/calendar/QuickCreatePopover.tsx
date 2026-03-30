'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { format, addHours } from 'date-fns';
import type { DisplayEvent } from '@/lib/display-event';
import { calendarSFX } from '@/lib/sound-manager';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { apiFetch } from '@/lib/api-fetch';

interface QuickCreatePopoverProps {
  day: Date;
  hour: number;
  anchorRect: DOMRect;
  onClose: () => void;
  onCreated?: (event: DisplayEvent) => void;
}

const POPOVER_WIDTH = 280;
const POPOVER_APPROX_HEIGHT = 180;

function computePosition(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.right + 8;
  let top = anchorRect.top;

  // Flip left if near right edge
  if (left + POPOVER_WIDTH > vw - 8) {
    left = anchorRect.left - POPOVER_WIDTH - 8;
  }
  left = Math.max(8, left);

  // Clamp bottom
  if (top + POPOVER_APPROX_HEIGHT > vh - 8) {
    top = Math.max(8, vh - POPOVER_APPROX_HEIGHT - 8);
  }
  top = Math.max(8, top);

  return { top, left };
}

function buildStartTime(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function formatDateTimeLabel(day: Date, hour: number): string {
  const d = buildStartTime(day, hour);
  return format(d, 'EEE MMM d, h:mm aa');
}

export function QuickCreatePopover({ day, hour, anchorRect, onClose, onCreated }: QuickCreatePopoverProps) {
  const { data: session } = useSession();
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = getUserRole(session);

  // Auto-focus title on mount
  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleCreate = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      titleInputRef.current?.focus();
      return;
    }

    setIsCreating(true);
    setError(null);

    const startTime = buildStartTime(day, hour);
    const endTime = addHours(startTime, 1);

    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Error ${res.status}`);
        return;
      }

      const created: DisplayEvent = await res.json();
      calendarSFX.play('spawn');
      onCreated?.(created);
      onClose();
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsCreating(false);
    }
  }, [title, day, hour, onCreated, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate();
  };

  // Gate: only host or admin can create events (after all hooks)
  if (!canCreateEvents(role)) return null;

  const pos = computePosition(anchorRect);
  const dateTimeLabel = formatDateTimeLabel(day, hour);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-grove-surface rounded-xl shadow-lg border border-grove-border"
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      role="dialog"
      aria-label="Quick create event"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-semibold text-grove-text uppercase tracking-wider">New Event</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-3">
        {/* Title input */}
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={e => { setTitle(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Event title"
          className="w-full text-sm bg-grove-border/20 border border-grove-border rounded-md px-3 py-2
                     text-grove-text placeholder:text-grove-text-muted
                     focus:outline-none focus:ring-1 focus:ring-grove-accent focus:border-grove-accent
                     transition-colors"
          disabled={isCreating}
        />

        {/* Date/time display */}
        <div className="text-xs text-grove-text-muted">
          <span className="font-medium text-grove-text">{dateTimeLabel}</span>
          <span className="ml-2 text-grove-accent-deep">· 1 hour</span>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isCreating || !title.trim()}
          className="flex-1 text-xs py-2 rounded-md bg-grove-accent text-grove-surface font-medium
                     hover:bg-grove-accent/90 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating...' : 'Create'}
        </button>
        <button
          onClick={onClose}
          className="text-xs py-2 px-3 rounded-md border border-grove-border text-grove-text-muted
                     hover:text-grove-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
