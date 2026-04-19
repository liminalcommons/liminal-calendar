'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { X, Edit2, Trash2, ExternalLink, MapPin, Video, Clock, Users, Repeat } from 'lucide-react';
import { useSession } from 'next-auth/react';
import type { DisplayEvent } from '@/lib/display-event';
import { calendarSFX } from '@/lib/sound-manager';
import { getUserRole, canEditEvent, canDeleteEvent } from '@/lib/auth-helpers';
import { apiFetch } from '@/lib/api-fetch';
import { formatInTimeZone } from 'date-fns-tz';
import { useRouter } from 'next/navigation';
import { useRsvpMutation } from '@/lib/rsvp/use-rsvp-mutation';

interface EventExpansionProps {
  event: DisplayEvent;
  anchorRect: DOMRect;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<DisplayEvent>) => void;
}

const POPOVER_WIDTH = typeof window !== 'undefined' ? Math.min(360, window.innerWidth - 16) : 360
const POPOVER_APPROX_HEIGHT = 420;

function computePosition(anchorRect: DOMRect): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.right + 8;
  let top = anchorRect.top;

  // Flip left if too close to right edge
  if (left + POPOVER_WIDTH > vw - 8) {
    left = anchorRect.left - POPOVER_WIDTH - 8;
  }
  // Clamp left
  left = Math.max(8, left);

  // Flip up if too close to bottom edge
  if (top + POPOVER_APPROX_HEIGHT > vh - 8) {
    top = Math.max(8, vh - POPOVER_APPROX_HEIGHT - 8);
  }
  top = Math.max(8, top);

  return { top, left };
}

function formatDuration(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatEventTime(event: DisplayEvent): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return formatInTimeZone(new Date(event.starts_at), tz, 'EEE MMM d, h:mm a zzz');
  } catch {
    return new Date(event.starts_at).toLocaleString();
  }
}

// Extract original DB event ID from expanded recurrence IDs like "42-20260401"
function getOriginalEventId(id: string): string {
  return id.replace(/-\d{8}$/, '');
}

export function EventExpansion({ event, anchorRect, onClose, onDelete, onUpdate }: EventExpansionProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(event.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleShimmer, setTitleShimmer] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(event.myResponse);
  const [attendeeCount, setAttendeeCount] = useState(event.attendees.going);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { submit: submitRsvp, pending: rsvpLoading } = useRsvpMutation(event.id);
  const [closing, setClosing] = useState(false);

  const role = getUserRole(session);
  const isCreator = session?.user?.id === event.creator_id || session?.user?.hyloId === event.creator_id;
  const canEdit = canEditEvent(role, isCreator);
  const canDelete = canDeleteEvent(role, isCreator);

  const pos = computePosition(anchorRect);

  // Play warp on mount
  useEffect(() => {
    calendarSFX.play('warp');
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

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const saveTitle = useCallback(async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === event.title) {
      setIsEditingTitle(false);
      setTitleValue(event.title);
      return;
    }
    setIsSavingTitle(true);
    try {
      const res = await apiFetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        onUpdate?.(event.id, { title: trimmed });
        setTitleShimmer(true);
        calendarSFX.play('shimmer');
        setTimeout(() => setTitleShimmer(false), 600);
      }
    } catch {
      // Revert on failure
      setTitleValue(event.title);
    } finally {
      setIsSavingTitle(false);
      setIsEditingTitle(false);
    }
  }, [titleValue, event.id, event.title, onUpdate]);

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveTitle();
    if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTitleValue(event.title);
    }
  };

  const handleRsvp = useCallback(async (response: 'yes' | 'interested' | 'no') => {
    if (rsvpLoading) return;
    const prevStatus = rsvpStatus;
    const prevCount = attendeeCount;

    // Optimistic update
    const newStatus = rsvpStatus === response ? null : response;
    setRsvpStatus(newStatus);
    if (response === 'yes') {
      setAttendeeCount(prev => newStatus === 'yes' ? prev + 1 : Math.max(0, prev - 1));
    }

    const result = await submitRsvp({ response: newStatus ?? 'no' });
    if (result.ok) {
      const newGoing = newStatus === 'yes' ? prevCount + 1 : Math.max(0, prevCount - 1);
      onUpdate?.(event.id, {
        myResponse: newStatus,
        attendees: { ...event.attendees, going: newGoing },
      });
    } else {
      setRsvpStatus(prevStatus);
      setAttendeeCount(prevCount);
    }
  }, [event.id, event.attendees, rsvpStatus, rsvpLoading, attendeeCount, onUpdate, submitRsvp]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const originalId = getOriginalEventId(event.id);
    try {
      const res = await apiFetch(`/api/events/${originalId}`, { method: 'DELETE' });
      if (res.ok) {
        calendarSFX.play('dissolve');
        setClosing(true);
        // Let fade-out animation play, then close and refresh
        setTimeout(() => {
          onDelete?.(event.id);
          onClose();
        }, 300);
        // Delay refresh so the animation is visible
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } catch {
      // ignore
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [event.id, onDelete, onClose]);

  const duration = formatDuration(event.starts_at, event.ends_at);
  const timeStr = formatEventTime(event);

  return (
    <div
      ref={popoverRef}
      className={`fixed z-50 bg-grove-surface rounded-xl shadow-lg border border-grove-border
        overflow-y-auto
        transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        closing ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'
      }`}
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)' }}
      role="dialog"
      aria-label={`Event details: ${event.title}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-2 gap-2">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={handleTitleKeyDown}
              disabled={isSavingTitle}
              className={`w-full text-lg font-serif font-semibold text-grove-text bg-grove-border/20
                          rounded px-1 -mx-1 focus:outline-none focus:ring-1 focus:ring-grove-accent
                          ${titleShimmer ? 'animate-pulse' : ''}`}
            />
          ) : (
            <h2
              className={`text-lg font-serif font-semibold text-grove-text leading-snug
                          ${canEdit ? 'cursor-text hover:text-grove-accent-deep transition-colors' : ''}
                          ${titleShimmer ? 'animate-pulse text-grove-accent' : ''}`}
              onClick={canEdit ? () => setIsEditingTitle(true) : undefined}
              title={canEdit ? 'Click to edit title' : undefined}
            >
              {titleValue}
            </h2>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-2.5">
        {/* Time + duration */}
        <div className="flex items-center gap-2 text-xs text-grove-text-muted">
          <Clock size={12} className="shrink-0 text-grove-accent" />
          <div>
            <span className="text-grove-text font-medium">{timeStr}</span>
            <span className="ml-1.5 text-grove-accent-deep font-medium">({duration})</span>
          </div>
        </div>

        {/* Host */}
        <div className="flex items-center gap-2 text-xs text-grove-text-muted">
          {event.creator_image ? (
            <img src={event.creator_image} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-grove-accent/20 shrink-0" />
          )}
          <span>Hosted by <span className="text-grove-text font-medium">{event.creator_name}</span></span>
        </div>

        {/* Location */}
        {event.location && !event.location.startsWith('http') && (
          <div className="flex items-center gap-2 text-xs text-grove-text-muted">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {/* Meeting link */}
        {event.event_url && (
          <div className="rounded-lg bg-grove-green/10 border border-grove-green/30 px-3 py-2 space-y-1.5">
            <a
              href={event.event_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-semibold text-grove-green hover:text-grove-green-deep transition-colors"
            >
              <Video size={14} className="shrink-0" />
              Join Meeting
              <ExternalLink size={10} className="shrink-0 opacity-60" />
            </a>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-grove-text-muted truncate flex-1 font-mono select-all">
                {event.event_url}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(event.event_url!);
                }}
                className="text-[10px] text-grove-accent-deep hover:text-grove-accent px-1.5 py-0.5
                           rounded border border-grove-border/60 hover:bg-grove-border/20
                           transition-colors shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Recurrence */}
        {event.recurrenceRule && (
          <div className="flex items-center gap-2 text-xs text-grove-text-muted">
            <Repeat size={12} className="shrink-0" />
            <span className="capitalize">{event.recurrenceRule}</span>
          </div>
        )}

        {/* Description — show more text */}
        {event.description && (
          <p className="text-xs text-grove-text-muted leading-relaxed line-clamp-5 whitespace-pre-line">
            {event.description.replace(/<[^>]*>/g, '')}
          </p>
        )}

        {/* Attendees */}
        {(attendeeCount > 0 || event.attendees.interested > 0) && (
          <div className="flex items-center gap-2 text-xs text-grove-text-muted">
            <Users size={12} className="shrink-0" />
            <span>
              {attendeeCount > 0 && <><span className="font-medium text-grove-text">{attendeeCount}</span> going</>}
              {attendeeCount > 0 && event.attendees.interested > 0 && ' · '}
              {event.attendees.interested > 0 && <><span className="font-medium text-grove-text">{event.attendees.interested}</span> interested</>}
            </span>
          </div>
        )}
      </div>

      {/* RSVP buttons */}
      <div className="px-4 pb-3 flex gap-2">
        {(['yes', 'interested', 'no'] as const).map(response => {
          const labels = { yes: 'Going', interested: 'Interested', no: 'Cancel' };
          const isActive = rsvpStatus === response;
          return (
            <button
              key={response}
              onClick={() => handleRsvp(response)}
              disabled={rsvpLoading}
              className={`flex-1 text-xs py-1.5 rounded-md border transition-colors font-medium
                ${isActive
                  ? 'bg-grove-accent text-grove-surface border-grove-accent'
                  : 'bg-transparent text-grove-text-muted border-grove-border hover:border-grove-accent/50 hover:text-grove-text'
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {labels[response]}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="px-4 pb-4 flex items-center justify-between border-t border-grove-border/40 pt-3">
        <Link
          href={`/events/${event.id}`}
          className="text-xs text-grove-accent-deep hover:text-grove-accent font-medium flex items-center gap-1 transition-colors"
          onClick={onClose}
        >
          View Details <ExternalLink size={11} />
        </Link>

        <div className="flex items-center gap-1">
          {canEdit && (
            <Link
              href={`/events/${event.id}/edit`}
              className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
              aria-label="Edit event"
              onClick={onClose}
            >
              <Edit2 size={14} />
            </Link>
          )}

          {canDelete && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-md text-grove-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              aria-label="Delete event"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="px-4 pb-4 border-t border-grove-border/40 pt-3">
          {event.recurrenceRule ? (
            <>
              <p className="text-xs text-grove-text-muted mb-2">This is a recurring event. What do you want to delete?</p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full text-xs py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white border border-red-500/60 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'All occurrences'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full text-xs py-1.5 rounded-md border border-grove-border text-grove-text-muted hover:text-grove-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-grove-text-muted mb-2">Delete this event? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 text-xs py-1.5 rounded-md bg-red-500/80 hover:bg-red-500 text-white border border-red-500/60 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 text-xs py-1.5 rounded-md border border-grove-border text-grove-text-muted hover:text-grove-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
