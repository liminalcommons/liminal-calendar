'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { DisplayEvent } from '@/lib/display-event';
import type { EventFormValues } from '@/lib/chat-tools';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { useResolvedRole } from '@/lib/use-resolved-role';

interface QuickCreatePopoverProps {
  day: Date;
  hour: number;
  anchorRect: DOMRect;
  onClose: () => void;
  // Kept for the WeeklyGrid's existing prop contract; unused now that the
  // popover only collects the title and hands off to /events/new.
  onCreated?: (event: DisplayEvent) => void;
}

const POPOVER_WIDTH = 360;
const POPOVER_APPROX_HEIGHT = 180;

function computePosition(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;

  let left = anchorRect.right + margin;
  if (left + POPOVER_WIDTH > vw - margin) {
    left = anchorRect.left - POPOVER_WIDTH - margin;
  }
  if (left < margin) left = margin;

  let top = anchorRect.top;
  if (top + POPOVER_APPROX_HEIGHT > vh - margin) {
    top = vh - POPOVER_APPROX_HEIGHT - margin;
  }
  if (top < margin) top = margin;
  return { top, left };
}

function buildStartTime(day: Date, halfHourSlot: number): Date {
  const h = Math.floor(halfHourSlot / 2);
  const m = (halfHourSlot % 2) * 30;
  const start = new Date(day);
  start.setHours(h, m, 0, 0);
  return start;
}

function formatDateTimeLabel(day: Date, halfHourSlot: number): string {
  const start = buildStartTime(day, halfHourSlot);
  return format(start, "EEE MMM d, h:mm a");
}

const DEFAULT_DURATION_MIN = 60;

export function QuickCreatePopover({ day, hour, anchorRect, onClose }: QuickCreatePopoverProps) {
  const { data: session } = useSession();
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { role: resolvedRole } = useResolvedRole();
  const role = resolvedRole ?? getUserRole(session);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleContinue = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Give it a working title — you can refine it with the assistant.");
      inputRef.current?.focus();
      return;
    }
    const startTime = buildStartTime(day, hour);
    const endTime = new Date(startTime.getTime() + DEFAULT_DURATION_MIN * 60_000);
    const handoff: Partial<EventFormValues> = {
      title: trimmed,
      date: format(day, 'yyyy-MM-dd'),
      startTime: format(startTime, 'HH:mm'),
      endTime: format(endTime, 'HH:mm'),
      meetingLink: 'https://castalia.one',
    };
    try { localStorage.setItem('calendar-quick-create-handoff', JSON.stringify(handoff)); } catch { /* ignore */ }
    onClose();
    router.push(`/events/new?day=${format(day, 'yyyy-MM-dd')}&slot=${hour}`);
  }, [title, day, hour, onClose, router]);

  if (!canCreateEvents(role)) return null;

  const pos = computePosition(anchorRect);
  const dateTimeLabel = formatDateTimeLabel(day, hour);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-grove-surface rounded-xl shadow-lg border border-grove-border flex flex-col"
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      role="dialog"
      aria-label="Quick create event"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-grove-text uppercase tracking-wider">
          <Sparkles size={12} className="text-grove-accent" />
          New Event
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 pb-1">
        <span className="text-xs text-grove-text-muted">{dateTimeLabel}</span>
      </div>

      <div className="px-4 pb-3">
        <label className="block text-xs font-medium text-grove-text mb-1.5">
          What&apos;s this event about?
        </label>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleContinue(); } }}
          placeholder="e.g. Friendship Circle"
          className="w-full text-sm px-3 py-2 rounded-md border border-grove-border bg-grove-bg text-grove-text
                     focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent"
          maxLength={140}
        />
        {error && (
          <p className="mt-1.5 text-xs text-red-400">{error}</p>
        )}
      </div>

      <div className="px-4 pb-3 flex items-center justify-end gap-2 border-t border-grove-border/40 pt-2">
        <button
          onClick={onClose}
          className="text-xs py-1.5 px-3 rounded-md border border-grove-border text-grove-text-muted
                     hover:text-grove-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleContinue}
          disabled={!title.trim()}
          className="text-xs py-1.5 px-4 rounded-md bg-grove-accent text-grove-surface font-medium
                     hover:bg-grove-accent/90 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
