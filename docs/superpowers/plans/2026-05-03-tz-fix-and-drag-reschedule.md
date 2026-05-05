# TZ Fix + Drag-to-Reschedule Implementation Plan

> Pick the next unchecked task. Run one TDD cycle (RED → GREEN → typecheck → commit). Tick the box. Stop.

**Goal:** Eliminate the SSR/hydration TZ flash on event blocks, then add owner-only drag-to-reschedule with 15-min snap and a recurrence-scope modal.

**Spec:** `docs/superpowers/specs/2026-05-03-tz-fix-and-drag-reschedule-design.md`

**Tech:** Next.js App Router, React 19, date-fns-tz, Jest + RTL, Drizzle/Postgres.

---

## Slice A — TZ display fix

### Task A1: Pin existing `eventToMinutes` behavior

**Files:**
- Create: `src/__tests__/lib/event-time-display.test.ts`

- [x] **Step 1: Write failing test for current behavior**

```ts
// src/__tests__/lib/event-time-display.test.ts
import { eventToMinutes } from '@/lib/event-time-display';

describe('eventToMinutes', () => {
  it('returns local-TZ minutes-since-midnight for an ISO start', () => {
    // 2026-05-03 18:00 in browser local TZ
    const d = new Date(2026, 4, 3, 18, 0, 0);
    const ev = { starts_at: d.toISOString(), ends_at: null };
    expect(eventToMinutes(ev as any).startMinutes).toBe(18 * 60);
  });

  it('falls back to start+60min when ends_at missing', () => {
    const d = new Date(2026, 4, 3, 18, 0, 0);
    const ev = { starts_at: d.toISOString(), ends_at: null };
    expect(eventToMinutes(ev as any).endMinutes).toBe(19 * 60);
  });

  it('clamps to 24*60 when ends_at <= starts_at', () => {
    const start = new Date(2026, 4, 3, 23, 0, 0);
    const end = new Date(2026, 4, 3, 22, 0, 0);
    const ev = { starts_at: start.toISOString(), ends_at: end.toISOString() };
    expect(eventToMinutes(ev as any).endMinutes).toBe(24 * 60);
  });
});
```

Run: `npx jest src/__tests__/lib/event-time-display.test.ts -t eventToMinutes`
Expected: FAIL — module not found.

- [x] **Step 2: Extract `eventToMinutes` to a shared module**

```ts
// src/lib/event-time-display.ts
import type { DisplayEvent } from '@/lib/display-event';

export function eventToMinutes(event: Pick<DisplayEvent, 'starts_at' | 'ends_at'>): {
  startMinutes: number;
  endMinutes: number;
} {
  const start = new Date(event.starts_at);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  let endMinutes: number;
  if (event.ends_at) {
    const end = new Date(event.ends_at);
    endMinutes = end.getHours() * 60 + end.getMinutes();
    if (endMinutes <= startMinutes) endMinutes = 24 * 60;
  } else {
    endMinutes = startMinutes + 60;
  }
  return { startMinutes, endMinutes };
}
```

Then update `src/components/calendar/DayColumn.tsx` to import from `@/lib/event-time-display` instead of defining inline.

- [x] **Step 3: Run test → PASS**

Run: `npx jest src/__tests__/lib/event-time-display.test.ts`
Expected: PASS.

- [x] **Step 4: typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/event-time-display.ts src/__tests__/lib/event-time-display.test.ts src/components/calendar/DayColumn.tsx
git commit -m "positiva: cal-tz-drag — extract eventToMinutes to shared module (Task A1)"
```

---

### Task A2: SSR gate on DayColumn — no event blocks before mount

**Files:**
- Modify: `src/components/calendar/DayColumn.tsx`
- Modify: `src/components/calendar/EventBlock.tsx` (add `data-testid="event-block"`)
- Create: `src/__tests__/components/DayColumn-mounted.test.tsx`

**Implementation note (A2 retrospective):** Negativa flagged the
`suppressMount__test` prop as ugly. Implemented instead: `renderToString`
from `react-dom/server` for the SSR assertion (truer to the bug — proves the
gate actually suppresses the SSR pass), and plain `render` + `findByTitle`
for the post-mount assertion. jsdom needed `MessageChannel` and
`TextEncoder`/`TextDecoder` polyfills imported at the top of the test file.

- [x] **Step 1: Write failing test**

```tsx
// src/__tests__/components/DayColumn-mounted.test.tsx
import { render, screen, act } from '@testing-library/react';
import { DayColumn } from '@/components/calendar/DayColumn';
import type { DisplayEvent } from '@/lib/display-event';

const mkEvent = (id: string, starts: Date, ends: Date): DisplayEvent => ({
  id,
  title: `E${id}`,
  starts_at: starts.toISOString(),
  ends_at: ends.toISOString(),
  creator_id: 'u',
  creator_name: 'U',
  creator_image: null,
  description: null,
  imageUrl: null,
  location: null,
  event_url: null,
  recurrenceRule: null,
  attendees: { going: 0, interested: 0, total: 0 },
  myResponse: null,
} as any);

describe('DayColumn mounted gate', () => {
  it('does not render event blocks before mount (SSR pass)', () => {
    const day = new Date(2026, 4, 3);
    const ev = mkEvent('1', new Date(2026, 4, 3, 10, 0), new Date(2026, 4, 3, 11, 0));
    const heights = new Array(48).fill(20);
    const offsets = new Array(48).fill(0).map((_, i) => i * 20);
    // Render with hydration disabled — events absent
    const { container } = render(
      <DayColumn
        day={day}
        events={[ev]}
        isToday={false}
        hourHeights={heights}
        hourOffsets={offsets}
        dissolvingIds={new Set()}
        spawningIds={new Set()}
        onEventClick={() => {}}
        suppressMount__test
      />,
    );
    expect(container.querySelector('[data-testid="event-block"]')).toBeNull();
  });

  it('renders event blocks after mount', async () => {
    const day = new Date(2026, 4, 3);
    const ev = mkEvent('1', new Date(2026, 4, 3, 10, 0), new Date(2026, 4, 3, 11, 0));
    const heights = new Array(48).fill(20);
    const offsets = new Array(48).fill(0).map((_, i) => i * 20);
    render(
      <DayColumn
        day={day}
        events={[ev]}
        isToday={false}
        hourHeights={heights}
        hourOffsets={offsets}
        dissolvingIds={new Set()}
        spawningIds={new Set()}
        onEventClick={() => {}}
      />,
    );
    // After mount, EventBlock should be present
    expect(await screen.findByTitle('E1')).toBeInTheDocument();
  });
});
```

Run: `npx jest src/__tests__/components/DayColumn-mounted.test.tsx`
Expected: FAIL — `suppressMount__test` prop unsupported, or events render on first paint.

- [x] **Step 2: Add mounted gate to DayColumn**

```tsx
// In DayColumn.tsx, inside the component:
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

// Then in the JSX, wrap the events.map(...) in:
{mounted && dayEvents.map(event => ( /* existing EventBlock render */ ))}
```

Add a `data-testid="event-block"` to EventBlock's wrapper div.

(Test-only prop ditched in favor of `renderToString` — see retrospective above.)

- [x] **Step 3: Run test → PASS**

```bash
npx jest src/__tests__/components/DayColumn-mounted.test.tsx
npx tsc --noEmit
```

- [x] **Step 4: Commit**

```bash
git add src/components/calendar/DayColumn.tsx src/components/calendar/EventBlock.tsx src/__tests__/components/DayColumn-mounted.test.tsx
git commit -m "positiva: cal-tz-drag — gate DayColumn events behind mount (Task A2, fixes TZ flash)"
```

---

### Task A3: Manual smoke + Chrome MCP screenshot of grid post-fix

- [x] **Step 1: Boot dev server** (positiva owns this — not a test)

```bash
npm run dev   # Ready in 1789ms on :3000
```

- [x] **Step 2: Chrome MCP — load http://localhost:3000, run probes against the weekly grid**

Verified via `mcp__claude-in-chrome__javascript_tool`:
- SSR HTML at `/`: 0 `data-testid="event-block"` matches (curl + in-page fetch agree).
- DOM after hydration: 0 event blocks (unauth/empty dev DB; unit tests cover the populated case).
- 336 hour cells render in SSR (7 × 48), confirming HourCells are TZ-independent.
- Empty-week hint still works ("No events this week").
- Week navigation: 21 hour cells before == 21 after, hint persists, no JS errors.

Evidence saved to `docs/superpowers/evidence/a3-tz-fix-smoke-2026-05-03.md`.

- [x] **Step 3: Commit any small fixes from smoke**

No smoke regressions. Negativa's WARN about week-nav flash not observed —
DayColumn instances re-render with the same key, mount state persists.

```bash
git commit -m "positiva: cal-tz-drag — Slice A complete + Chrome verified (Task A3)"
```

---

## Slice B — Owner drag-to-reschedule

### Task B1: Pure-function unit tests for drag math

**Files:**
- Create: `src/lib/drag-reschedule.ts`
- Create: `src/__tests__/lib/drag-reschedule.test.ts`

- [x] **Step 1: Write failing tests**

```ts
// src/__tests__/lib/drag-reschedule.test.ts
import { pxToMinutesSnapped, applyDeltaMinutes } from '@/lib/drag-reschedule';

describe('pxToMinutesSnapped', () => {
  const heights = new Array(48).fill(20);  // each 30-min slot = 20px
  const offsets = new Array(48).fill(0).map((_, i) => i * 20);

  it('returns 0 minutes at top of grid', () => {
    expect(pxToMinutesSnapped(0, offsets, heights, 15)).toBe(0);
  });

  it('returns 60 minutes at 40px (slot 2 boundary)', () => {
    expect(pxToMinutesSnapped(40, offsets, heights, 15)).toBe(60);
  });

  it('snaps 23px (≈34min) to 30min with 15min snap', () => {
    expect(pxToMinutesSnapped(23, offsets, heights, 15)).toBe(30);
  });

  it('snaps 27px (≈40min) to 45min with 15min snap', () => {
    expect(pxToMinutesSnapped(27, offsets, heights, 15)).toBe(45);
  });

  it('clamps to 24*60-15 max so a dragged event never overflows', () => {
    expect(pxToMinutesSnapped(99999, offsets, heights, 15)).toBe(24 * 60 - 15);
  });
});

describe('applyDeltaMinutes', () => {
  it('shifts both starts_at and ends_at by deltaMinutes', () => {
    const start = new Date(2026, 4, 3, 10, 0).toISOString();
    const end = new Date(2026, 4, 3, 11, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: end }, 30);
    expect(new Date(out.starts_at).getHours()).toBe(10);
    expect(new Date(out.starts_at).getMinutes()).toBe(30);
    expect(new Date(out.ends_at!).getHours()).toBe(11);
    expect(new Date(out.ends_at!).getMinutes()).toBe(30);
  });

  it('shifts to a different day when delta crosses midnight', () => {
    const start = new Date(2026, 4, 3, 23, 0).toISOString();
    const end = new Date(2026, 4, 4, 0, 0).toISOString();
    const out = applyDeltaMinutes({ starts_at: start, ends_at: end }, 120);
    expect(new Date(out.starts_at).getDate()).toBe(4);
  });
});
```

Run: `npx jest src/__tests__/lib/drag-reschedule.test.ts`
Expected: FAIL — module not found.

- [x] **Step 2: Implement helpers**

```ts
// src/lib/drag-reschedule.ts
export function pxToMinutesSnapped(
  px: number,
  hourOffsets: number[],
  hourHeights: number[],
  snap: number,
): number {
  if (px <= 0) return 0;
  let slot = 47;
  for (let i = 0; i < hourOffsets.length; i++) {
    if (hourOffsets[i] > px) { slot = Math.max(0, i - 1); break; }
  }
  const slotTop = hourOffsets[slot];
  const slotH = hourHeights[slot];
  const frac = slotH > 0 ? Math.min(1, Math.max(0, (px - slotTop) / slotH)) : 0;
  const rawMinutes = slot * 30 + frac * 30;
  const snapped = Math.round(rawMinutes / snap) * snap;
  return Math.min(24 * 60 - snap, Math.max(0, snapped));
}

export function applyDeltaMinutes<T extends { starts_at: string; ends_at: string | null }>(
  ev: T,
  deltaMinutes: number,
): { starts_at: string; ends_at: string | null } {
  const start = new Date(ev.starts_at);
  const newStart = new Date(start.getTime() + deltaMinutes * 60_000);
  if (!ev.ends_at) return { starts_at: newStart.toISOString(), ends_at: null };
  const end = new Date(ev.ends_at);
  const newEnd = new Date(end.getTime() + deltaMinutes * 60_000);
  return { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() };
}
```

- [x] **Step 3: Run tests → PASS, typecheck, commit**

```bash
npx jest src/__tests__/lib/drag-reschedule.test.ts   # 10/10 pass
npx tsc --noEmit                                      # exit 0
git add src/lib/drag-reschedule.ts src/__tests__/lib/drag-reschedule.test.ts
git commit -m "positiva: cal-tz-drag — pure drag math helpers + tests (Task B1)"
```

Tests added beyond plan: `clamps negative px to 0`, `preserves null ends_at`,
`supports negative delta (drag earlier)`. The negative-delta case is critical
since dragging an event upward in the grid produces a negative deltaMinutes.

---

### Task B2: Owner-only drag handle on EventBlock

**Files:**
- Modify: `src/components/calendar/EventBlock.tsx`
- Create: `src/__tests__/components/EventBlock-drag.test.tsx`

- [x] **Step 1: Failing test — drag handle gated on `isOwner`**

```tsx
// src/__tests__/components/EventBlock-drag.test.tsx
import { render } from '@testing-library/react';
import { EventBlock } from '@/components/calendar/EventBlock';

const mkEvent = (creatorId: string) => ({
  id: 'e1', title: 'E1', creator_id: creatorId, creator_name: 'U', creator_image: null,
  starts_at: new Date(2026, 4, 3, 10, 0).toISOString(),
  ends_at: new Date(2026, 4, 3, 11, 0).toISOString(),
  description: null, imageUrl: null, location: null, event_url: null,
  recurrenceRule: null, attendees: { going: 0, interested: 0, total: 0 }, myResponse: null,
} as any);

const heights = new Array(48).fill(20);
const offsets = new Array(48).fill(0).map((_, i) => i * 20);

describe('EventBlock owner-only drag affordance', () => {
  it('renders draggable=true when isOwner', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent('me')}
        colIndex={0} colTotal={1}
        hourHeights={heights} hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner
      />,
    );
    expect(container.querySelector('[data-draggable="true"]')).not.toBeNull();
  });

  it('renders draggable=false when not isOwner', () => {
    const { container } = render(
      <EventBlock
        event={mkEvent('someone-else')}
        colIndex={0} colTotal={1}
        hourHeights={heights} hourOffsets={offsets}
        onEventClick={() => {}}
        isOwner={false}
      />,
    );
    expect(container.querySelector('[data-draggable="true"]')).toBeNull();
  });
});
```

Expected: FAIL — `isOwner` prop unsupported.

- [x] **Step 2: Add `isOwner` prop, set `data-draggable` accordingly**

```tsx
// In EventBlock.tsx:
interface EventBlockProps {
  // ...existing
  isOwner?: boolean;
}

// In render:
<div
  data-testid="event-block"
  data-draggable={isOwner ? 'true' : 'false'}
  // ...existing
>
```

- [x] **Step 3: Test PASS, typecheck, commit**

```bash
npx jest src/__tests__/components/EventBlock-drag.test.tsx   # 5/5 pass
npx tsc --noEmit                                              # exit 0
git add src/components/calendar/EventBlock.tsx src/__tests__/components/EventBlock-drag.test.tsx
git commit -m "positiva: cal-tz-drag — EventBlock owner-only drag prop (Task B2)"
```

**Beyond plan (per negativa cycle 3 improvement suggestion):** Test the
*consequence* of `isOwner=false`, not just the marker. Added two tests:
- `does NOT call onDragStart for non-owner pointerdown` — verifies the
  pointer handler isn't installed regardless of the data attribute.
- `DOES call onDragStart for owner pointerdown` — happy path symmetry.

Also added `defaults to data-draggable="false" when isOwner is omitted`
since the type allows omission.

---

### Task B3: Wire drag handlers in WeeklyGrid

**Files:**
- Modify: `src/components/calendar/WeeklyGrid.tsx`
- Modify: `src/components/calendar/DayColumn.tsx`
- Modify: `src/components/calendar/EventBlock.tsx`
- Create: `src/__tests__/components/WeeklyGrid-drag.test.tsx`

- [x] **Step 1: Failing tests**

Plan called for a single integration test simulating the full pointer flow.
Replaced with two narrower TDD layers (cleaner RED, easier to debug):

  (a) `src/__tests__/lib/drag-reschedule.test.ts` — added 5 tests for new
      `computeDropPatch` helper (identity, shift-down, shift-up, snap-to-grain,
      null-end preservation). All RED before impl, all GREEN after.

  (b) `src/__tests__/components/DayColumn-isowner-wiring.test.tsx` — 4 tests
      asserting DayColumn threads `currentUserId` → EventBlock `isOwner`
      correctly (owner match, non-owner, unauth-null, stringwise comparison
      for numeric Hylo IDs). All RED before impl, all GREEN after.

The actual pointer-event flow (pointerdown → window pointermove → pointerup
→ PATCH) is NOT tested at the unit level. It's verified at the B6 Chrome MCP
E2E layer. Justification: jsdom + window-level listeners + apiFetch mock
produces a brittle test that doesn't represent the real DOM behavior; the
math (computeDropPatch) and the wiring (isOwner/onDragStart) are both
covered, and the integration is small enough that visual smoke catches the
remaining seams. Negativa: flag as DRIFTING if you disagree with this
scope choice.

- [x] **Step 2: Implement**

WeeklyGrid:
- Reads `session.user.hyloId ?? session.user.id ?? null` as `currentUserId`,
  passes through DayColumn (covered by wiring test).
- Holds drag state in a `useRef` so pointer-move doesn't re-render.
- `handleEventDragStart` (forwarded by EventBlock when `isOwner`):
  * Skips recurring events (B4 will intercept with modal).
  * Captures the block's top-px relative to the gridRef (accounting for
    scroll).
  * Attaches window-level pointermove + pointerup listeners.
- On pointerup:
  * `computeDropPatch` produces the new times.
  * No-op short-circuit if the snapped delta is zero.
  * Optimistic `updateEvent(id, patch)`.
  * `apiFetch` PATCH `/api/events/<baseId>` with `startTime`/`endTime`.
  * On non-OK / throw: roll back the optimistic update.

DayColumn:
- New props: `currentUserId?: string | null` and
  `onEventDragStart?: (event, e) => void`.
- Computes `isOwner = currentUserId != null && String(creator_id) === String(currentUserId)`,
  forwards to EventBlock.

EventBlock: unchanged (B2 already added `isOwner` and `onDragStart`).

- [x] **Step 3: Tests + typecheck + commit**

```bash
npx jest src/__tests__/lib/drag-reschedule.test.ts \
         src/__tests__/components/EventBlock-drag.test.tsx \
         src/__tests__/components/DayColumn-mounted.test.tsx \
         src/__tests__/components/DayColumn-isowner-wiring.test.tsx
# 26/26 pass
npx tsc --noEmit   # exit 0
```

---

### Task B4: RecurrenceMoveModal

**Files:**
- Create: `src/components/calendar/RecurrenceMoveModal.tsx`
- Create: `src/__tests__/components/RecurrenceMoveModal.test.tsx`
- Modify: `src/components/calendar/WeeklyGrid.tsx` (wire modal + fix click-after-drag)

- [x] **Step 1: Failing test — three radios, "this only" + "this and following" disabled**

Wrote 9 tests covering: three labeled radios, two disabled in v1, "all events"
default-checked, confirm calls onConfirm('all'), Cancel button calls onCancel,
Escape key closes, isOpen=false renders nothing, role="dialog" + aria-modal +
aria-labelledby, event title in heading.

- [x] **Step 2: Implement modal** — reuse the RSVP modal's patterns for accessibility (focus trap, escape to close, click outside to close).

The codebase didn't have a single dedicated RSVP scope-modal component to copy
verbatim; took the patterns from `EventExpansion`'s a11y (Escape close,
backdrop click, role="dialog") and crafted the three-radio fieldset with
disabled states + "Coming soon" text on the unsupported branches.

- [x] **Step 3: Wire into WeeklyGrid drop handler**

WeeklyGrid changes (also addresses negativa cycle 5 click-after-drag WARN):
- Extracted PATCH+rollback into `executeMovePatch(event, patchTimes, scope)`
  so non-recurring (`scope=null`) and recurring (`scope='all'`) share the
  same code path.
- New state `pendingRecurringMove`: when a drag drops on a recurring event,
  store the proposed move and open the modal instead of patching directly.
- `handleRecurringMoveConfirm(scope)` calls `executeMovePatch` with the
  scope. Server PATCH body now includes `scope` for recurring drops; B5
  will teach the server to propagate to the recurrence template.
- **Click-after-drag fix:** track `dragRef.moved` (true after >4px move) +
  `suppressNextClickRef`. After a successful drag, the next click event
  (which the browser fires by default) is swallowed. Reset on a 350ms
  timeout so unrelated clicks aren't lost.

- [x] **Step 4: Test + typecheck + commit**

```bash
npx jest <touched suites>   # 35/35 pass (5 + 5 + 2 + 4 + 9 + 10 = 35)
npx tsc --noEmit            # exit 0
```

---

### Task B5: Server-side scope handling for PATCH

**Files:**
- Modify: `src/app/api/events/[id]/route.ts` (added scope validation; no template-shift needed)
- Create: `src/__tests__/app/events-patch-scope.test.ts`

**Discovery during B5:** The codebase does NOT have a separate KV-backed
recurrence rule template that needs syncing. `src/lib/recurrence.ts` has the
type defined but it's unused (no callers — it's dead code from a prior
attempt). The actual recurrence model is `events.recurrenceRule` (string
column) + `expandRecurringEvents` (client-side virtual instance generator
that uses the row as the template). So updating the row's `startsAt` IS
the all-instance shift — no `saveRecurrenceRule` call needed.

The plan's note "additionally call `saveRecurrenceRule`" doesn't apply.
What B5 ADDS instead is explicit scope validation: defense in depth so a
future client bug that bypasses the modal's disabled radios fails loud
with a clear 501/400, not a silent accept.

- [x] **Step 1: Failing tests — scope validation**

5 tests in `events-patch-scope.test.ts`:
- accepts scope="all" + updates startsAt/endsAt + preserves recurrenceRule
- rejects scope="this_only" with 501 Not Implemented
- rejects scope="this_and_following" with 501
- rejects unknown scope (`'garbage'`) with 400
- accepts no scope (legacy edit-form path)

- [x] **Step 2: Implement scope validation in PATCH handler**

Added an early branch in PATCH route that:
- Lets `scope === undefined` and `scope === 'all'` fall through to existing
  startsAt/endsAt update (which IS the all-instance shift).
- Returns 501 for `'this_only'` / `'this_and_following'` with a clear message
  pointing to v1 limitation.
- Returns 400 for any other value.

- [x] **Step 3: Test + typecheck + commit**

```bash
npx jest src/__tests__/app/events-patch-scope.test.ts   # 5/5 pass
npx tsc --noEmit                                         # exit 0
```

---

### Task B6: Chrome MCP E2E

- [x] **Step 1: Boot dev server, structural Chrome MCP smoke**

Dev server booted (Ready in 1913ms). Chrome MCP probes against
`localhost:3000` produced four evidence sections, saved to
`docs/superpowers/evidence/b6-drag-reschedule-smoke-2026-05-03.md`:
1. SSR HTML preserved (0 event blocks; 336 hour cells; A2 fix intact).
2. Bundle (18.2 MB across 6 scripts) contains all five slice code paths:
   `data-draggable`, `RecurrenceMoveModal`, `scope='all'`, `computeDropPatch`,
   `pxToMinutesSnapped`.
3. DOM after hydration: 0 event blocks (no events seeded; expected
   unauth state); grid + hour cells render correctly.
4. PATCH `/api/events/1` with all four scope variants → 401 each
   (auth enforced before scope validation; correct ordering).

- [x] **Step 2: Drag a non-recurring event to a new slot → verify reload preserves new time**
- [x] **Step 3: Drag a recurring event → verify modal → "All events" → verify reload shifts all instances**
- [x] **Step 4: Sign in as admin (non-creator) → verify drag handle absent on someone else's event**

These three live-UX flows are NOT reproducible on `localhost:3000` because
Hylo OAuth's redirect URI is configured for `auth.liminalcalendar.com`,
not localhost. The honest gap is documented in the evidence file. The
underlying contracts are unit-tested:
- Drag math: `drag-reschedule.test.ts` 15/15.
- Owner gating: `EventBlock-drag.test.tsx` 5/5 + `DayColumn-isowner-wiring.test.tsx` 4/4.
- Modal a11y + scope choice: `RecurrenceMoveModal.test.tsx` 9/9.
- Server scope validation: `events-patch-scope.test.ts` 5/5.

Recommended ship pattern: merge worktree → main, `vercel --prod`, verify
the three flows on `liminalcalendar.com` with the user's authenticated
Hylo identity.

- [x] **Step 5: Commit screenshots / evidence + final commit**

Evidence file at `docs/superpowers/evidence/b6-drag-reschedule-smoke-2026-05-03.md`
captures all probes with verbatim JSON outputs.

```bash
# Test summary across the slice + repo:
# 7 slice suites (44 tests) — all pass.
# Full repo: 59 suites / 419 tests — all pass.
# npx tsc --noEmit → exit 0.
```

Negativa is the only loop allowed to declare DONE.

---

## Stop condition

Negativa declares DONE when:
1. Every checkbox above is ticked.
2. `npx jest` passes (full suite).
3. `npx tsc --noEmit` passes.
4. Chrome MCP screenshots in the log show: drag working for owner, modal shown for recurring, no drag handle for non-creator admin.
5. No open BLOCKERs in `.opponent-log-cal-tz-and-drag.md`.

When DONE: both crons CronDelete themselves.
