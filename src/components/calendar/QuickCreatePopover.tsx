'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Video, FileText, Repeat, Globe } from 'lucide-react';
import { UserPicker, type PickedUser } from './UserPicker';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { DisplayEvent } from '@/lib/display-event';
import { calendarSFX } from '@/lib/sound-manager';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { apiFetch } from '@/lib/api-fetch';
import { COMMUNITY_TIMEZONES, formatTimeInTimezone, getHourInTimezone } from '@/lib/timezone-utils';

interface QuickCreatePopoverProps {
  day: Date;
  hour: number;
  anchorRect: DOMRect;
  onClose: () => void;
  onCreated?: (event: DisplayEvent) => void;
}

const POPOVER_WIDTH = 340;
const POPOVER_APPROX_HEIGHT = 480;

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

function buildStartTime(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
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

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

const inputClass = `w-full text-xs bg-grove-border/20 border border-grove-border rounded-md px-2.5 py-1.5
  text-grove-text placeholder:text-grove-text-muted
  focus:outline-none focus:ring-1 focus:ring-grove-accent focus:border-grove-accent transition-colors`;

export function QuickCreatePopover({ day, hour, anchorRect, onClose, onCreated }: QuickCreatePopoverProps) {
  const { data: session } = useSession();
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [recurrence, setRecurrence] = useState('');
  const [invitees, setInvitees] = useState<PickedUser[]>([]);
  const [hyloGroupId, setHyloGroupId] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = getUserRole(session);
  const router = useRouter();

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

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

  // Fetch user's Hylo groups for the "Post to Hylo" picker
  useEffect(() => {
    let cancelled = false;
    setGroupsLoading(true);
    apiFetch('/api/groups')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ id: string; name: string; slug: string }>) => {
        if (!cancelled) setGroups(data);
      })
      .catch(() => {
        /* silently ignore — dropdown will just be empty */
      })
      .finally(() => {
        if (!cancelled) setGroupsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    const body: Record<string, unknown> = {
      title: trimmed,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };

    if (description.trim()) body.details = description.trim();
    if (meetingLink.trim()) body.location = meetingLink.trim();
    if (recurrence) body.recurrenceRule = recurrence;
    if (invitees.length) body.invitees = invitees.map(u => u.id);
    if (hyloGroupId) body.hyloGroupId = hyloGroupId;

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
      onClose();
      // Refresh server component to show new event (including recurrence instances)
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setIsCreating(false);
    }
  }, [title, description, meetingLink, durationMinutes, recurrence, invitees, hyloGroupId, day, hour, onCreated, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) handleCreate();
  };

  if (!canCreateEvents(role)) return null;

  const pos = computePosition(anchorRect);
  const dateTimeLabel = formatDateTimeLabel(day, hour);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-grove-surface rounded-xl shadow-lg border border-grove-border"
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
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
      <div className="px-4 pb-3 space-y-2.5">
        {/* Title */}
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

        {/* Date/time + duration */}
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

        {/* Timezone preview — show event time across community timezones */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-grove-text-muted px-0.5">
          {COMMUNITY_TIMEZONES.filter((_, i) => i % 2 === 0 || i === COMMUNITY_TIMEZONES.length - 1).map(tz => {
            const eventStart = buildStartTime(day, hour);
            const h = getHourInTimezone(eventStart, tz.id);
            const isLate = h >= 22 || h <= 5;
            return (
              <span key={tz.id} className={isLate ? 'text-red-400' : ''}>
                {tz.label} {formatTimeInTimezone(eventStart, tz.id)}
              </span>
            );
          })}
        </div>

        {/* Meeting link */}
        <div className="flex items-center gap-2">
          <Video size={14} className="text-grove-text-muted shrink-0" />
          <input
            type="url"
            value={meetingLink}
            onChange={e => setMeetingLink(e.target.value)}
            placeholder="Meeting link (optional)"
            className={`flex-1 ${inputClass}`}
            disabled={isCreating}
          />
        </div>

        {/* Description */}
        <div className="flex items-start gap-2">
          <FileText size={14} className="text-grove-text-muted shrink-0 mt-1.5" />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className={`flex-1 ${inputClass} resize-none`}
            disabled={isCreating}
          />
        </div>

        {/* Recurrence */}
        <div className="flex items-center gap-2">
          <Repeat size={14} className="text-grove-text-muted shrink-0" />
          <select
            value={recurrence}
            onChange={e => setRecurrence(e.target.value)}
            className={`flex-1 ${inputClass}`}
            disabled={isCreating}
          >
            {RECURRENCE_OPTIONS.map(r => (
              <option key={r.value} value={r.value} className="bg-grove-surface text-grove-text">{r.label}</option>
            ))}
          </select>
        </div>

        {/* Post to Hylo group */}
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-grove-text-muted shrink-0" />
          <select
            value={hyloGroupId}
            onChange={e => setHyloGroupId(e.target.value)}
            className={`flex-1 ${inputClass}`}
            disabled={isCreating || groupsLoading}
          >
            <option value="" className="bg-grove-surface text-grove-text">Don&apos;t post to Hylo</option>
            {groups.map(g => (
              <option key={g.id} value={g.id} className="bg-grove-surface text-grove-text">{g.name}</option>
            ))}
          </select>
        </div>

        {/* Invite members */}
        <UserPicker
          selected={invitees}
          onChange={setInvitees}
          disabled={isCreating}
          eventStart={buildStartTime(day, hour)}
        />

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
