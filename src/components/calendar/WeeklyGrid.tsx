'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, isToday, addWeeks, subWeeks, addDays, isBefore, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useUserTimezone } from '@/lib/timezone-utils';
import type { DisplayEvent } from '@/lib/display-event';
import { getWeekStart, getWeekDays, DAY_NAMES } from '@/lib/calendar-utils';
import { calendarSFX } from '@/lib/sound-manager';
import { useEvents } from '@/lib/use-events';
import { computeHourHeights, computeFisheyeHeights, computeHourOffsets } from '@/lib/golden-hours';
import { canCreateEvents } from '@/lib/auth-helpers';
import { useResolvedRole } from '@/lib/use-resolved-role';
import { computeCrossDayDropTimes } from '@/lib/drag-reschedule';
import { DragFloat } from './DragFloat';
import { DragEdgeIndicator } from './DragEdgeIndicator';
import { apiFetch } from '@/lib/api-fetch';
import { RecurrenceMoveModal, type RecurrenceMoveScope } from './RecurrenceMoveModal';
import { MoonPhase } from '@/components/MoonPhase';
import { TimeGutter } from './TimeGutter';
import { DayColumn } from './DayColumn';
import { NowIndicator } from './NowIndicator';
import { EventExpansion } from './EventExpansion';
import { QuickCreatePopover } from './QuickCreatePopover';
import { AgendaSidebar } from './AgendaSidebar';

interface WeeklyGridProps {
  events: DisplayEvent[];
}

export function WeeklyGrid({ events: serverEvents }: WeeklyGridProps) {
  const { data: session } = useSession();
  // Role lives on the Hylo session for Hylo users, but on the members row
  // for Clerk users. useResolvedRole hits /api/profile, which handles both.
  const { role: resolvedRole } = useResolvedRole();
  const userRole = resolvedRole ?? (session?.user?.role as 'member'|'host'|'admin' | undefined) ?? 'member';
  const canCreate = canCreateEvents(userRole);
  const { events, dissolvingIds, spawningIds, addEvent, removeEvent, updateEvent } = useEvents(serverEvents);
  // Identify the viewing user — DayColumn compares this against each event's
  // creator_id to decide drag affordance. Hylo ID is the canonical identity
  // (matches event.creator_id); falls back to user.id (NextAuth user id) if
  // the session shape varies. `null` = unauthenticated → no drag anywhere.
  const sessionUser = session?.user as { hyloId?: string; clerkId?: string; id?: string } | undefined;
  // Clerk users carry their identity on members.clerkId, not the NextAuth
  // session. WeeklyGrid receives events with creator_id = whichever provider
  // id was used at creation; useResolvedRole's profile fetch already runs,
  // so we hit the same /api/profile here for the canonical identifier.
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (cancelled || !p) return;
      setResolvedUserId(p.hyloId ?? p.clerkId ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [mutedSeriesIds, setMutedSeriesIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    const refresh = () => fetch('/api/preferences/notifications/muted', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { muted: [] })
      .then((j: { muted?: { eventId: number }[] }) =>
        setMutedSeriesIds(new Set((j.muted ?? []).map(m => m.eventId)))
      )
      .catch(() => {});
    refresh();

    // Service worker fires this when the user taps "🔕 Mute series" on a
    // push notification — keeps the grid's 🔕 indicators + dim styling in
    // sync without requiring a full page reload.
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('liminal-mute');
      channel.onmessage = (e: MessageEvent<{ eventId: number; muted: boolean }>) => {
        setMutedSeriesIds(prev => {
          const next = new Set(prev);
          if (e.data.muted) next.add(e.data.eventId);
          else next.delete(e.data.eventId);
          return next;
        });
      };
    } catch {
      // BroadcastChannel unsupported — silent
    }
    return () => { channel?.close(); };
  }, []);
  const currentUserId = resolvedUserId ?? sessionUser?.hyloId ?? sessionUser?.id ?? null;
  const userTz = useUserTimezone();

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() =>
    getWeekStart(new Date())
  );
  const [currentSlot, setCurrentSlot] = useState<number>(() => {
    const now = new Date();
    return now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
  });
  const [expansion, setExpansion] = useState<{ event: DisplayEvent; rect: DOMRect } | null>(null);
  const [quickCreate, setQuickCreate] = useState<{ day: Date; hour: number; rect: DOMRect } | null>(null);
  // Set true on a successful drag (pointer moved past threshold) so the
  // synthetic click that fires after pointerup doesn't trigger a popover or a
  // cell navigation. Read by handleEventClickGuarded AND handleCellClick.
  const suppressNextClickRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [centerSlot, setCenterSlot] = useState(24); // slot 24 = 12:00 PM

  const weekDays = getWeekDays(currentWeekStart);

  // Fisheye slot heights — recompute when center slot changes
  const hourHeights = useMemo(() => computeFisheyeHeights(centerSlot), [centerSlot]);
  const hourOffsets = useMemo(() => computeHourOffsets(hourHeights), [hourHeights]);
  const totalGridHeight = hourHeights.reduce((s, h) => s + h, 0);

  // Update current slot every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentSlot(now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fisheye scroll handler — compute which slot is at viewport center
  const lastCenterRef = useRef(24);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const viewportCenter = el.scrollTop + el.clientHeight / 2;
        const offsets = computeHourOffsets(computeFisheyeHeights(lastCenterRef.current));
        let slot = 0;
        for (let i = 0; i < 48; i++) {
          if (offsets[i] > viewportCenter) break;
          slot = i;
        }
        const slotTop = offsets[slot];
        const slotH = computeFisheyeHeights(lastCenterRef.current)[slot];
        const frac = slotH > 0 ? (viewportCenter - slotTop) / slotH : 0;
        const newCenter = Math.round((slot + Math.min(frac, 1)) * 2) / 2; // quantize to 0.5
        if (newCenter !== lastCenterRef.current) {
          lastCenterRef.current = newCenter;
          setCenterSlot(newCenter);
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Scroll to midday on initial load (slot 22 = 11 AM)
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || hasScrolledRef.current) return;
    const initialOffsets = computeHourOffsets(computeFisheyeHeights(24));
    el.scrollTop = initialOffsets[22] ?? 0;
    hasScrolledRef.current = true;
  }, []);

  function isCurrentWeek(weekStart: Date): boolean {
    const todayWeek = getWeekStart(new Date());
    return weekStart.getTime() === todayWeek.getTime();
  }

  const goToPrevWeek = useCallback(() => {
    setCurrentWeekStart(prev => subWeeks(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
    calendarSFX.play('navigate');
  }, []);

  const goToToday = useCallback(() => {
    setCurrentWeekStart(getWeekStart(new Date()));
    calendarSFX.play('navigate');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        goToPrevWeek();
        break;
      case 'ArrowRight':
        e.preventDefault();
        goToNextWeek();
        break;
      case 'Escape':
        e.preventDefault();
        goToToday();
        break;
    }
  }, [goToToday, goToPrevWeek, goToNextWeek]);

  const handleCellClick = useCallback((day: Date, hour: number, rect: DOMRect) => {
    // Suppress synthetic click immediately after a drag (pointerup → click).
    // Without this, releasing the drag over an empty HourCell navigates to
    // the create-event page instead of completing the drop.
    if (suppressNextClickRef.current) return;
    // If the event-detail popover is open, treat this click as a popover
    // dismissal rather than a "create new event" navigation. Real users on
    // touch devices can have synthesized events route to a HourCell when the
    // intended target was inside the popover.
    setExpansion((cur) => {
      if (cur) return null;
      // Open inline quick-create popover anchored to the clicked cell.
      // Full /events/new is still reachable via the popover's "More options"
      // link for power users who need fields beyond title/duration/recurrence.
      setQuickCreate({ day, hour, rect });
      return cur;
    });
  }, []);

  const handleEventClick = useCallback((event: DisplayEvent, rect: DOMRect) => {
    setQuickCreate(null);
    setExpansion({ event, rect });
  }, []);

  const handleEventCreated = useCallback((event: DisplayEvent) => {
    addEvent(event);
  }, [addEvent]);

  const handleEventDeleted = useCallback((id: string) => {
    removeEvent(id);
    setExpansion(null);
  }, [removeEvent]);

  const handleEventUpdated = useCallback((id: string, patch: Partial<DisplayEvent>) => {
    updateEvent(id, patch);
  }, [updateEvent]);

  // ── Drag-to-reschedule (owner-only) ──
  // Drag state is held in a ref so pointer-move handlers don't trigger React
  // re-renders mid-drag. The grid root captures pointer-down on EventBlock
  // (forwarded as onEventDragStart from DayColumn), then attaches window-level
  // move + up listeners until release. Recurring events open RecurrenceMoveModal
  // on drop instead of patching directly.
  const dragRef = useRef<{
    event: DisplayEvent;
    // Cursor's grab offset within the original block (so the float clone keeps
    // the cursor at the same relative point on the block).
    grabOffsetX: number;
    grabOffsetY: number;
    blockWidth: number;
    blockHeight: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    // Cross-week edge auto-advance state. Set when the cursor enters a left/
    // right edge zone; the timer fires goToPrevWeek/goToNextWeek and clears.
    edgeDirection: 'left' | 'right' | null;
    edgeAdvanceTimer: number | null;
    // rAF coalescing for pointermove → setState.
    rafId: number | null;
    // Latest pointermove event so the rAF callback uses fresh coords.
    lastEvent: PointerEvent | null;
  } | null>(null);
  const [pendingRecurringMove, setPendingRecurringMove] = useState<{
    event: DisplayEvent;
    patchTimes: { starts_at: string; ends_at: string | null };
  } | null>(null);
  // Live drag preview state. setState ONLY fires when something semantically
  // changes (snap step crossing, edge zone enter/exit, drag start/end). Cursor
  // position is owned by JS via dragFloatRef.current.style.transform — no
  // setState per pointermove, so the float follows at native frame rate
  // without re-rendering WeeklyGrid + the day grid.
  const dragFloatRef = useRef<HTMLDivElement>(null);
  const [dragLive, setDragLive] = useState<{
    event: DisplayEvent;
    initialCursorX: number;
    initialCursorY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    blockWidth: number;
    blockHeight: number;
    snapTarget: {
      dayIndex: number;
      starts_at: string;
      ends_at: string | null;
      topPx: number;
      heightPx: number;
    } | null;
    edgeZone: 'left' | 'right' | null;
  } | null>(null);

  const executeMovePatch = useCallback(
    async (
      event: DisplayEvent,
      patchTimes: { starts_at: string; ends_at: string | null },
      scope: RecurrenceMoveScope | null,
    ) => {
      // Optimistic update for the on-screen instance.
      updateEvent(event.id, patchTimes as Partial<DisplayEvent>);

      // Strip the recurring-instance suffix (e.g. "10-20260412" → "10")
      // since the underlying record has the bare ID.
      const baseId = event.id.replace(/-\d{8}$/, '');
      try {
        const res = await apiFetch(`/api/events/${baseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startTime: patchTimes.starts_at,
            endTime: patchTimes.ends_at,
            // For recurring events, scope='all' tells the server to also
            // shift the recurrence rule template. Non-recurring sends null.
            ...(scope ? { scope } : {}),
          }),
        });
        if (!res.ok) {
          updateEvent(event.id, {
            starts_at: event.starts_at,
            ends_at: event.ends_at,
          } as Partial<DisplayEvent>);
        }
      } catch {
        updateEvent(event.id, {
          starts_at: event.starts_at,
          ends_at: event.ends_at,
        } as Partial<DisplayEvent>);
      }
    },
    [updateEvent],
  );

  // The visible week's start. Captured in a ref so the in-flight drag handlers
  // see the LATEST week (cross-week edge advance changes it mid-drag). Without
  // this, the snap target would always compute against the week present at
  // pointerdown.
  const currentWeekStartRef = useRef(currentWeekStart);
  currentWeekStartRef.current = currentWeekStart;

  const handleEventDragStart = useCallback(
    (event: DisplayEvent, e: React.PointerEvent<HTMLDivElement>) => {
      const blockEl = e.currentTarget as HTMLElement;
      const blockRect = blockEl.getBoundingClientRect();
      const grabOffsetX = e.clientX - blockRect.left;
      const grabOffsetY = e.clientY - blockRect.top;

      dragRef.current = {
        event,
        grabOffsetX,
        grabOffsetY,
        blockWidth: blockRect.width,
        blockHeight: blockRect.height,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
        edgeDirection: null,
        edgeAdvanceTimer: null,
        rafId: null,
        lastEvent: null,
      };

      // Pure snap calculation from a cursor (clientX/Y). Returns null if the
      // cursor is not over any DayColumn (e.g., outside the grid). Shared by
      // the rAF preview update AND the synchronous handleUp drop logic.
      const computeSnapAt = (cursorX: number, cursorY: number) => {
        const probeY = cursorY - (dragRef.current?.grabOffsetY ?? 0)
          + (dragRef.current?.blockHeight ?? 0) / 2;
        const els = document.elementsFromPoint(cursorX, probeY);
        const dayColEl = els.find(
          (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-day-index'),
        );
        if (!dayColEl || !dragRef.current) return null;
        const dayIndex = parseInt(dayColEl.getAttribute('data-day-index')!, 10);
        const colRect = dayColEl.getBoundingClientRect();
        // colRect.top is already in viewport coords AFTER the grid's scroll,
        // and the column's children are positioned in the column's *local*
        // coords (which match viewport offsets from colRect.top, regardless
        // of how far the grid has been scrolled). Adding scrollTop here was
        // double-counting and pushing blockTopY past the day's end → clamped
        // to 23:45 → vertical drag silently produced a no-op.
        const blockTopY = (cursorY - dragRef.current.grabOffsetY) - colRect.top;
        const destDay = addDays(currentWeekStartRef.current, dayIndex);
        const destDayMidnight = new Date(destDay);
        destDayMidnight.setHours(0, 0, 0, 0);
        const out = computeCrossDayDropTimes({
          blockTopYInColumn: blockTopY,
          destDayMidnight,
          originalStartIso: dragRef.current.event.starts_at,
          originalEndIso: dragRef.current.event.ends_at,
          hourOffsets,
          hourHeights,
          snap: 15,
        });
        return {
          dayIndex,
          starts_at: out.starts_at,
          ends_at: out.ends_at,
          topPx: out.snappedTopPx,
          heightPx: out.snappedHeightPx,
        };
      };

      const computeAndApply = () => {
        const drag = dragRef.current;
        if (!drag || !drag.lastEvent) return;
        drag.rafId = null;
        const mvEvent = drag.lastEvent;
        const cursorX = mvEvent.clientX;
        const cursorY = mvEvent.clientY;
        if (!drag.moved) return; // float not yet visible

        // ── Cross-week edge auto-advance ──
        // After advancing, the timer is RE-ARMED so a user holding the cursor
        // in the edge zone can keep paging through weeks (300ms per page).
        // The advance closure reschedules itself instead of clearing.
        const gridEl = gridRef.current;
        let edgeZone: 'left' | 'right' | null = null;
        if (gridEl) {
          const gr = gridEl.getBoundingClientRect();
          const distLeft = cursorX - gr.left;
          const distRight = gr.right - cursorX;
          const inLeftEdge = distLeft >= 0 && distLeft < 56;
          const inRightEdge = distRight >= 0 && distRight < 56;
          edgeZone = inLeftEdge ? 'left' : inRightEdge ? 'right' : null;
          if (edgeZone !== drag.edgeDirection) {
            if (drag.edgeAdvanceTimer != null) {
              clearTimeout(drag.edgeAdvanceTimer);
              drag.edgeAdvanceTimer = null;
            }
            drag.edgeDirection = edgeZone;
            if (edgeZone) {
              // First advance has a longer hold (more reaction time before
              // the user is "committed" to a cross-week drag). Subsequent
              // re-arms are slower (700ms) so continuous paging feels
              // deliberate, not rapid-fire.
              const scheduleAdvance = (delay: number) => {
                if (!dragRef.current || dragRef.current.edgeDirection !== edgeZone) return;
                if (edgeZone === 'left') setCurrentWeekStart(prev => subWeeks(prev, 1));
                else setCurrentWeekStart(prev => addWeeks(prev, 1));
                if (dragRef.current && dragRef.current.edgeDirection === edgeZone) {
                  dragRef.current.edgeAdvanceTimer = window.setTimeout(
                    () => scheduleAdvance(700),
                    delay,
                  );
                }
              };
              drag.edgeAdvanceTimer = window.setTimeout(() => scheduleAdvance(700), 600);
            }
          }
        }

        const snapTarget = computeSnapAt(cursorX, cursorY);

        // Only setState when something semantic changed. Cursor X/Y are owned
        // by the float ref, NOT React state, so cursor movement alone does
        // not trigger a re-render.
        setDragLive(prev => {
          if (!prev) {
            // First semantic update for this drag — mount the float.
            return {
              event: drag.event,
              initialCursorX: cursorX,
              initialCursorY: cursorY,
              grabOffsetX: drag.grabOffsetX,
              grabOffsetY: drag.grabOffsetY,
              blockWidth: drag.blockWidth,
              blockHeight: drag.blockHeight,
              snapTarget,
              edgeZone,
            };
          }
          const sameSnap =
            (prev.snapTarget == null && snapTarget == null)
            || (prev.snapTarget != null && snapTarget != null
                && prev.snapTarget.dayIndex === snapTarget.dayIndex
                && prev.snapTarget.starts_at === snapTarget.starts_at);
          const sameEdge = prev.edgeZone === edgeZone;
          if (sameSnap && sameEdge) return prev;
          return { ...prev, snapTarget, edgeZone };
        });
      };

      const handleMove = (mvEvent: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        drag.lastEvent = mvEvent;
        // Threshold — synchronous so quick releases still register the drag.
        if (!drag.moved) {
          const dx = mvEvent.clientX - drag.startClientX;
          const dy = mvEvent.clientY - drag.startClientY;
          if (Math.hypot(dx, dy) > 4) {
            drag.moved = true;
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
          }
        }
        // Mutate the float's transform DIRECTLY on every native pointermove.
        // Bypasses React entirely, so the cursor follows at native frame rate
        // (no setState, no reconciliation, no flicker).
        if (drag.moved && dragFloatRef.current) {
          const x = mvEvent.clientX - drag.grabOffsetX;
          const y = mvEvent.clientY - drag.grabOffsetY;
          dragFloatRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.02)`;
        }
        // Snap detection + edge zone are rAF-coalesced (lower frequency).
        if (drag.rafId != null) return;
        drag.rafId = requestAnimationFrame(computeAndApply);
      };

      const handleUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const drag = dragRef.current;
        if (drag?.edgeAdvanceTimer != null) clearTimeout(drag.edgeAdvanceTimer);
        if (drag?.rafId != null) cancelAnimationFrame(drag.rafId);

        if (!drag) {
          setDragLive(null);
          return;
        }

        // Compute the FINAL snap target from the release cursor synchronously —
        // do not rely on dragLive (the rAF preview may not have caught the last
        // pointermove before pointerup fired). This is the source of truth for
        // the drop.
        const finalSnap = drag.moved ? computeSnapAt(upEvent.clientX, upEvent.clientY) : null;
        dragRef.current = null;
        setDragLive(null);

        if (!drag.moved) return;

        suppressNextClickRef.current = true;
        setTimeout(() => { suppressNextClickRef.current = false; }, 350);

        // Cursor wasn't over any DayColumn → cancel drop.
        if (!finalSnap) return;
        const patchTimes = { starts_at: finalSnap.starts_at, ends_at: finalSnap.ends_at };

        // No-op drop (same time after snap).
        if (patchTimes.starts_at === drag.event.starts_at) return;

        if (drag.event.recurrenceRule) {
          setPendingRecurringMove({ event: drag.event, patchTimes });
          return;
        }
        void executeMovePatch(drag.event, patchTimes, null);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [hourHeights, hourOffsets, executeMovePatch],
  );

  const handleEventClickGuarded = useCallback(
    (event: DisplayEvent, rect: DOMRect) => {
      // Suppress click immediately after a drag (pointerup → click sequence).
      if (suppressNextClickRef.current) return;
      handleEventClick(event, rect);
    },
    [handleEventClick],
  );

  const handleRecurringMoveConfirm = useCallback(
    (scope: RecurrenceMoveScope) => {
      const pending = pendingRecurringMove;
      setPendingRecurringMove(null);
      if (!pending) return;
      void executeMovePatch(pending.event, pending.patchTimes, scope);
    },
    [pendingRecurringMove, executeMovePatch],
  );

  // Week header label
  const weekLabel = (() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (start.getMonth() === end.getMonth()) {
      return format(start, 'MMMM yyyy');
    }
    if (start.getFullYear() !== end.getFullYear()) {
      return `${format(start, 'MMM yyyy')} – ${format(end, 'MMM yyyy')}`;
    }
    return `${format(start, 'MMM')} – ${format(end, 'MMM yyyy')}`;
  })();

  return (
    <div
      className="flex flex-col h-full bg-grove-bg focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Weekly calendar grid"
    >
      {/* ── Header bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-grove-surface border-b border-grove-border">
        <div className="flex items-center gap-3">
          <MoonPhase />
          <span className="text-sm font-semibold text-grove-text">{weekLabel}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={goToToday}
            className="px-3 py-1 rounded-md text-xs font-medium text-grove-accent-deep
                       hover:bg-grove-border/30 border border-grove-border/60 transition-colors"
            aria-label="Go to today"
          >
            Today
          </button>

          <button
            onClick={goToNextWeek}
            className="p-1.5 rounded-md text-grove-text-muted hover:text-grove-text hover:bg-grove-border/30 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Live drag preview: float that follows cursor + time tooltip ── */}
      {dragLive && (
        <>
          <DragFloat
            ref={dragFloatRef}
            event={dragLive.event}
            initialCursorX={dragLive.initialCursorX}
            initialCursorY={dragLive.initialCursorY}
            grabOffsetX={dragLive.grabOffsetX}
            grabOffsetY={dragLive.grabOffsetY}
            width={dragLive.blockWidth}
            height={dragLive.blockHeight}
            userTz={userTz}
          />
          {dragLive.edgeZone && gridRef.current && (
            <DragEdgeIndicator
              side={dragLive.edgeZone}
              gridRect={gridRef.current.getBoundingClientRect()}
            />
          )}
          {dragLive.snapTarget && (
            <div
              data-testid="drag-preview-tooltip"
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[60]
                         bg-grove-surface border border-grove-accent/60
                         shadow-lg rounded-full px-4 py-1.5
                         text-sm font-medium text-grove-text pointer-events-none
                         flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-grove-accent animate-pulse" />
              <span>
                {formatInTimeZone(new Date(dragLive.snapTarget.starts_at), userTz, 'EEE h:mm a')}
                {dragLive.snapTarget.ends_at && (
                  <>
                    {' – '}
                    {formatInTimeZone(new Date(dragLive.snapTarget.ends_at), userTz, 'h:mm a')}
                  </>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {/* ── Popovers ── */}
      {expansion && (
        <EventExpansion
          event={expansion.event}
          anchorRect={expansion.rect}
          onClose={() => setExpansion(null)}
          onDelete={handleEventDeleted}
          onUpdate={handleEventUpdated}
        />
      )}
      {quickCreate && (
        <QuickCreatePopover
          day={quickCreate.day}
          hour={quickCreate.hour}
          anchorRect={quickCreate.rect}
          onClose={() => setQuickCreate(null)}
          onCreated={handleEventCreated}
        />
      )}
      <RecurrenceMoveModal
        isOpen={pendingRecurringMove !== null}
        eventTitle={pendingRecurringMove?.event.title ?? ''}
        onConfirm={handleRecurringMoveConfirm}
        onCancel={() => setPendingRecurringMove(null)}
      />

      {/* ── Main area: calendar + sidebar side by side ── */}
      <div className="flex flex-1 min-h-0">
        {/* Calendar section (headers + grid) */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Day headers row */}
          <div className="flex-shrink-0 flex bg-grove-surface border-b border-grove-border">
            <div className="w-14 flex-shrink-0" />

            {weekDays.map((day, i) => {
              const today = isToday(day);
              const dayNum = format(day, 'd');
              const dayName = DAY_NAMES[i];

              return (
                <div
                  key={i}
                  className="flex-1 min-w-0 flex flex-col items-center justify-center py-1 border-l border-grove-border"
                >
                  <span className={`text-[10px] font-medium uppercase tracking-wider ${
                    today ? 'text-grove-accent' : 'text-grove-text-muted'
                  }`}>
                    {dayName}
                  </span>
                  <span className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center mt-0.5 ${
                    today
                      ? 'bg-grove-accent text-grove-surface'
                      : 'text-grove-text'
                  }`}>
                    {dayNum}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grid body — scrollable */}
          <div
            ref={gridRef}
            className="flex-1 overflow-y-auto"
            style={{ minHeight: 0 }}
          >
            <div className="flex" style={{ height: totalGridHeight }}>
              {/* Time gutter */}
              <TimeGutter hourHeights={hourHeights} />

              {/* Day columns + NowIndicator */}
              <div className="relative flex flex-1 min-w-0">
                {isCurrentWeek(currentWeekStart) && (
                  <NowIndicator hourHeights={hourHeights} hourOffsets={hourOffsets} />
                )}

                {/* Empty week hint */}
                {(() => {
                  const weekEnd = addDays(currentWeekStart, 7);
                  return !events.some(e => {
                    const start = parseISO(e.starts_at);
                    return !isBefore(start, currentWeekStart) && isBefore(start, weekEnd);
                  });
                })() && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="text-center text-grove-text-muted/50 select-none">
                      <p className="text-sm">No events this week</p>
                      <p className="text-xs mt-1">Click any time slot to create one</p>
                    </div>
                  </div>
                )}

                {weekDays.map((day, i) => (
                  <DayColumn
                    key={i}
                    day={day}
                    events={events}
                    isToday={isToday(day)}
                    currentHour={currentSlot}
                    hourHeights={hourHeights}
                    hourOffsets={hourOffsets}
                    dissolvingIds={dissolvingIds}
                    spawningIds={spawningIds}
                    onCellClick={canCreate ? handleCellClick : undefined}
                    onEventClick={handleEventClickGuarded}
                    currentUserId={currentUserId}
                    onEventDragStart={handleEventDragStart}
                    draggingEventId={dragLive?.event.id ?? null}
                    dayIndex={i}
                    snapTargetDayIndex={dragLive?.snapTarget?.dayIndex}
                    snapTopPx={dragLive?.snapTarget?.topPx}
                    snapHeightPx={dragLive?.snapTarget?.heightPx}
                    mutedSeriesIds={mutedSeriesIds}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Agenda sidebar */}
        <div className="hidden lg:block">
          <AgendaSidebar
            events={events}
            weekDays={weekDays}
            onEventClick={handleEventClick}
          />
        </div>
      </div>
    </div>
  );
}
