'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DisplayEvent } from '@/lib/display-event';
import type { EventFormValues } from '@/lib/chat-tools';
import { calendarSFX } from '@/lib/sound-manager';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { apiFetch } from '@/lib/api-fetch';
import { TimeStrip } from './TimeStrip';
import { ChatPanel } from '@/components/chat/ChatPanel';

interface QuickCreatePopoverProps {
  day: Date;
  hour: number;
  anchorRect: DOMRect;
  onClose: () => void;
  onCreated?: (event: DisplayEvent) => void;
}

const POPOVER_WIDTH = 420;
const POPOVER_APPROX_HEIGHT = 600;

function computePosition(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.right + 8;
  let top = anchorRect.top;

  if (left + POPOVER_WIDTH > vw - 8) {
    left = anchorRect.left - POPOVER_WIDTH - 8;
  }
  left = Math.max(8, left);

  if (top + POPOVER_APPROX_HEIGHT > vh - 8) {
    top = Math.max(8, vh - POPOVER_APPROX_HEIGHT - 8);
  }
  top = Math.max(8, top);

  return { top, left };
}

function buildStartTime(day: Date, slot: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(slot / 2), (slot % 2) * 30, 0, 0);
  return d;
}

function formatDateTimeLabel(day: Date, hour: number): string {
  const d = buildStartTime(day, hour);
  return format(d, 'EEE MMM d, h:mm aa');
}

const DURATION_OPTIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
  { label: '3 hours', minutes: 180 },
];

export function QuickCreatePopover({ day, hour, anchorRect, onClose, onCreated }: QuickCreatePopoverProps) {
  const { data: session } = useSession();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // EventFormValues holds everything the chat assistant fills in via tool
  // calls. We pre-seed date/start/end from the clicked cell so the AI doesn't
  // have to ask "when?" — it can focus on what the event is about.
  const [formValues, setFormValues] = useState<EventFormValues>(() => {
    const start = buildStartTime(day, hour);
    const end = new Date(start.getTime() + 60 * 60_000);
    return {
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
      meetingLink: 'https://castalia.one',
    };
  });

  const role = getUserRole(session);
  const router = useRouter();

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

  const handleFormUpdate = useCallback((updates: Partial<EventFormValues>) => {
    setFormValues(prev => ({ ...prev, ...updates }));
  }, []);

  // Keep formValues.startTime/endTime in sync with the duration picker — the
  // duration UI is the canonical source for end time inside the popover, so
  // the chat assistant gets a coherent end whenever the user adjusts it.
  useEffect(() => {
    const start = buildStartTime(day, hour);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    setFormValues(prev => ({
      ...prev,
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
    }));
  }, [day, hour, durationMinutes]);

  const handleCreate = useCallback(async () => {
    const trimmed = (formValues.title || '').trim();
    if (!trimmed) {
      setError('Tell the assistant what the event is about, then click Create.');
      return;
    }

    setIsCreating(true);
    setError(null);

    const startTime = buildStartTime(day, hour);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      title: trimmed,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };

    if (formValues.description?.trim()) body.details = formValues.description.trim();
    if (formValues.meetingLink?.trim()) body.location = formValues.meetingLink.trim();
    if (formValues.recurrence && formValues.recurrence !== 'none') {
      body.recurrenceRule = formValues.recurrence;
    }
    if (formValues.imageUrl) body.imageUrl = formValues.imageUrl;

    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Error ${res.status}`);
        return;
      }

      const created: DisplayEvent = await res.json();
      calendarSFX.play('spawn');
      onCreated?.(created);
      // Clear chat history for next time
      try { localStorage.removeItem('calendar-chat-quick-create'); } catch { /* ignore quota / disabled storage */ }
      onClose();
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsCreating(false);
    }
  }, [formValues, durationMinutes, day, hour, onCreated, onClose, router]);

  if (!canCreateEvents(role)) return null;

  const pos = computePosition(anchorRect);
  const dateTimeLabel = formatDateTimeLabel(day, hour);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-grove-surface rounded-xl shadow-lg border border-grove-border flex flex-col"
      style={{
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        maxHeight: 'calc(100vh - 16px)',
        height: POPOVER_APPROX_HEIGHT,
      }}
      role="dialog"
      aria-label="Quick create event"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
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

      {/* Time controls + strip — pre-seeded from the clicked cell */}
      <div className="px-4 pb-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-grove-text">{dateTimeLabel}</span>
          <select
            value={durationMinutes}
            onChange={e => setDurationMinutes(Number(e.target.value))}
            className="text-xs bg-grove-border/20 border border-grove-border rounded-md px-2 py-1
                       text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
            disabled={isCreating}
          >
            {DURATION_OPTIONS.map(d => (
              <option key={d.minutes} value={d.minutes} className="bg-grove-surface text-grove-text">{d.label}</option>
            ))}
          </select>
        </div>
        <TimeStrip
          startTime={buildStartTime(day, hour)}
          durationMinutes={durationMinutes}
        />
      </div>

      {/* Captured fields summary (chips) — shows what the assistant has set */}
      {(formValues.title || formValues.description || formValues.recurrence) && (
        <div className="px-4 pb-2 flex flex-wrap gap-1 shrink-0">
          {formValues.title && (
            <span className="text-[10px] bg-grove-accent/15 text-grove-text border border-grove-accent/40 rounded-full px-2 py-0.5">
              Title: {formValues.title}
            </span>
          )}
          {formValues.recurrence && formValues.recurrence !== 'none' && (
            <span className="text-[10px] bg-grove-border/30 text-grove-text-muted border border-grove-border rounded-full px-2 py-0.5">
              Repeats: {formValues.recurrence}
            </span>
          )}
          {formValues.description && (
            <span className="text-[10px] bg-grove-border/30 text-grove-text-muted border border-grove-border rounded-full px-2 py-0.5 max-w-[220px] truncate">
              Desc: {formValues.description}
            </span>
          )}
        </div>
      )}

      {/* Chat — fills remaining vertical space */}
      <div className="flex-1 min-h-0 px-1 pb-1">
        <ChatPanel
          formValues={formValues}
          onFormUpdate={handleFormUpdate}
          storageKey="calendar-chat-quick-create"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-1 text-xs text-red-400 shrink-0">{error}</div>
      )}

      {/* Footer actions */}
      <div className="px-4 pb-3 pt-1 flex items-center gap-2 shrink-0 border-t border-grove-border/40">
        <Link
          href={`/events/new?day=${format(day, 'yyyy-MM-dd')}&slot=${hour}`}
          className="text-[11px] text-grove-accent-deep hover:text-grove-accent transition-colors mr-auto"
          onClick={onClose}
        >
          More options →
        </Link>
        <button
          onClick={onClose}
          className="text-xs py-1.5 px-3 rounded-md border border-grove-border text-grove-text-muted
                     hover:text-grove-text transition-colors"
          disabled={isCreating}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={isCreating || !formValues.title?.trim()}
          className="text-xs py-1.5 px-4 rounded-md bg-grove-accent text-grove-surface font-medium
                     hover:bg-grove-accent/90 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}
