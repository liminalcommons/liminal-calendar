# Calendar TZ Display Fix + Owner Drag-to-Reschedule

**Status:** Approved 2026-05-03

## Problem

Two bugs / asks reported by user against the live calendar at `liminalcalendar.com`:

1. **Wrong-time render flash.** Events render at one row position on SSR (Node UTC) and snap to a different row on hydration (browser local TZ). For events near midnight UTC they can render in the wrong day column. User reports it as "wrong time I selected, and one extra".
2. **No drag-to-reschedule.** User wants to click-and-drag events on the weekly grid to move them, **owner-only** (admins cannot move events they didn't create).

## Approach

### Slice A — TZ fix (small)

Root cause: SSR runs in UTC on Vercel. The Date positioning math in `DayColumn.eventToMinutes` (`getHours()`) and the time labels in `EventBlock` (`useUserTimezone()` returns `'UTC'` until `useEffect`) all silently disagree across SSR vs. hydrated client.

Fix: do not render event blocks server-side at all. Render the empty grid on SSR; mount events client-only after hydration so positioning math runs once with the real browser TZ. This trades "flash to wrong slot then snap" for "grid paints, events appear shortly after" — the latter matches Google Calendar.

Implementation:
- `DayColumn` gates the event-block loop behind a `mounted` state set in `useEffect`. Cells render unconditionally; events only after mount.
- `EventBlock` keeps its `useUserTimezone()` call but is now never rendered with `'UTC'` (since the parent gate ensures it only mounts post-hydration).
- `eventToMinutes` keeps using browser local TZ via `getHours()` — correct after the SSR gate.

### Slice B — Owner drag-to-reschedule

UX:
- Pointer-down on an `EventBlock` → ghost element follows pointer.
- Snap to 15-minute increments (matching the form picker grain).
- Drop computes new `startsAt` from pointer Y coordinate within the day column; preserves duration.
- Cross-column drop = different day; same-column drop = same day, new time.
- Visual: hovering ghost shows `H:MMa` time label.

Permission: owner-only. The `isCreator` check in `EventExpansion.tsx:59` is the existing source of truth — drag is gated on the same predicate. Admins who are not the creator see no drag affordance.

Recurring events: on drop, if `event.recurrenceRule` is set, open `RecurrenceMoveModal` with three options matching the RSVP modal pattern:
- **This event only** — create a single-instance override (out of scope for v1; show as disabled with "coming soon" label so the choice is visible but only the supported branches commit).
- **This and following** — out of scope v1 (same treatment).
- **All events** — shifts the recurrence template by the same delta (`endsAt - startsAt` preserved, template `startTime`/`endTime` shifted by drop delta). This is the v1-supported branch.

Non-recurring events: skip modal; PATCH directly with new times.

Server: existing `PATCH /api/events/[id]` already accepts `startTime`/`endTime` ISO strings (see `EventForm.tsx:498-510`). Drag-to-reschedule reuses that endpoint with no schema changes for non-recurring events. For "all" on recurring events the PATCH must also propagate to the recurrence rule template — the `materialize` cron already reads from the rule, so updating the rule template is what shifts future instances.

Optimistic UI: on drop, immediately move the EventBlock to its new position and call PATCH. On failure, snap back and toast an error.

## Acceptance criteria

### Tests (Jest)

1. `eventToMinutes(event)` returns minutes-since-midnight in browser local TZ (regression test pinning current behavior so SSR-gate refactor doesn't break math).
2. `DayColumn` renders no event blocks before mount, all event blocks after mount (RTL test using `act()` for the mount transition).
3. `useDragReschedule` hook (new): pure function `pxToMinutesSnapped(px, hourHeights, snap=15)` returns the right snapped minute value.
4. `EventBlock` exposes a drag handle iff `isOwner === true`. Admin-but-not-creator: no handle. Member: no handle.
5. `RecurrenceMoveModal` opens when a recurring event is dropped. Renders three radio options. "This event only" and "This and following" are disabled. "All events" is the default + only enabled choice.
6. PATCH `/api/events/[id]` integration test: owner can move event, member cannot, admin-non-creator cannot.

### E2E (Chrome MCP)

1. Sign in as owner → drag a non-recurring event to a new slot → reload → event is at new slot.
2. Drag a recurring event → modal opens → choose "All events" → confirm → reload → all instances shifted.
3. Sign in as admin (non-creator) → no drag handle visible on someone else's event.

## Out of scope (v1)

- "This event only" override path (requires new exception model in DB).
- "This and following" rule split (requires recurrence rule fork).
- Cross-week drag (drop must land in current week's grid).
- Resize-to-extend (only move, not change duration).

## Files

| File | Change |
|---|---|
| `src/components/calendar/DayColumn.tsx` | Add `mounted` gate; pass `onDragStart`/`onDrop` |
| `src/components/calendar/EventBlock.tsx` | Add owner-only drag handle, ghost element |
| `src/components/calendar/WeeklyGrid.tsx` | Wire drag end → PATCH + optimistic update |
| `src/lib/drag-reschedule.ts` *(new)* | Pure helpers: `pxToMinutesSnapped`, `computeDropTarget`, `applyDelta` |
| `src/components/calendar/RecurrenceMoveModal.tsx` *(new)* | Three-option modal for recurring drops |
| `src/__tests__/lib/drag-reschedule.test.ts` *(new)* | Hook unit tests |
| `src/__tests__/components/EventBlock-drag.test.tsx` *(new)* | Owner-gating tests |
| `src/__tests__/components/DayColumn-mounted.test.tsx` *(new)* | SSR gate test |
| `src/__tests__/app/events-patch-recurring.test.ts` | Server-side perm tests for recurring move |
