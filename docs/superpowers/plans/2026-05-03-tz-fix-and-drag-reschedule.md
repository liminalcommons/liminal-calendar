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

- [ ] **Step 1: Boot dev server** (positiva owns this — not a test)

```bash
npm run dev
```

- [ ] **Step 2: Chrome MCP — load http://localhost:3000, screenshot the weekly grid**

Use `mcp__claude-in-chrome__tabs_context_mcp` first, then `navigate` + `read_page`. Verify:
- Grid renders without an empty-events flash followed by a snap.
- Event blocks appear at the correct row for the user's local TZ.

Save screenshot path to log.

- [ ] **Step 3: Commit any small fixes from smoke**

If the gate breaks something (e.g., agenda sidebar empty week hint), fix and re-test.

```bash
git commit -m "positiva: cal-tz-drag — Slice A complete + Chrome verified (Task A3)"
```

---

## Slice B — Owner drag-to-reschedule

### Task B1: Pure-function unit tests for drag math

**Files:**
- Create: `src/lib/drag-reschedule.ts`
- Create: `src/__tests__/lib/drag-reschedule.test.ts`

- [ ] **Step 1: Write failing tests**

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

- [ ] **Step 2: Implement helpers**

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

- [ ] **Step 3: Run tests → PASS, typecheck, commit**

```bash
npx jest src/__tests__/lib/drag-reschedule.test.ts
npx tsc --noEmit
git add src/lib/drag-reschedule.ts src/__tests__/lib/drag-reschedule.test.ts
git commit -m "positiva: cal-tz-drag — pure drag math helpers + tests (Task B1)"
```

---

### Task B2: Owner-only drag handle on EventBlock

**Files:**
- Modify: `src/components/calendar/EventBlock.tsx`
- Create: `src/__tests__/components/EventBlock-drag.test.tsx`

- [ ] **Step 1: Failing test — drag handle gated on `isOwner`**

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

- [ ] **Step 2: Add `isOwner` prop, set `data-draggable` accordingly**

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

- [ ] **Step 3: Test PASS, typecheck, commit**

```bash
npx jest src/__tests__/components/EventBlock-drag.test.tsx
npx tsc --noEmit
git add src/components/calendar/EventBlock.tsx src/__tests__/components/EventBlock-drag.test.tsx
git commit -m "positiva: cal-tz-drag — EventBlock owner-only drag prop (Task B2)"
```

---

### Task B3: Wire drag handlers in WeeklyGrid

**Files:**
- Modify: `src/components/calendar/WeeklyGrid.tsx`
- Modify: `src/components/calendar/DayColumn.tsx`
- Modify: `src/components/calendar/EventBlock.tsx`
- Create: `src/__tests__/components/WeeklyGrid-drag.test.tsx`

- [ ] **Step 1: Failing integration test — pointer drag on owner's event triggers PATCH**

```tsx
// Mock apiFetch, simulate pointerdown → pointermove → pointerup, assert PATCH called with new times.
```

(Full code in spec; pattern: `fireEvent.pointerDown(block, { clientY: 200 })`, etc.)

- [ ] **Step 2: Implement**

`WeeklyGrid` owns the pointer-move + drop handlers, computes `deltaMinutes` via `pxToMinutesSnapped`, calls `applyDeltaMinutes`, optimistically updates via `updateEvent(id, patch)`, then PATCHes the API. On 4xx/5xx, rolls back.

For recurring events, intercept at drop and open `RecurrenceMoveModal` instead of patching directly.

- [ ] **Step 3: Tests + typecheck + commit**

---

### Task B4: RecurrenceMoveModal

**Files:**
- Create: `src/components/calendar/RecurrenceMoveModal.tsx`
- Create: `src/__tests__/components/RecurrenceMoveModal.test.tsx`

- [ ] **Step 1: Failing test — three radios, "this only" + "this and following" disabled**

- [ ] **Step 2: Implement modal** — reuse the RSVP modal's patterns for accessibility (focus trap, escape to close, click outside to close).

- [ ] **Step 3: Wire into WeeklyGrid drop handler**

- [ ] **Step 4: Test + typecheck + commit**

---

### Task B5: Server-side perm test for PATCH on recurring "all"

**Files:**
- Modify: `src/app/api/events/[id]/route.ts` (if needed — check whether template propagation already happens)
- Create: `src/__tests__/app/events-patch-recurring-all.test.ts`

- [ ] **Step 1: Failing test — PATCH with `{ scope: 'all', startTime, endTime }` on recurring event shifts the recurrence template**

- [ ] **Step 2: Implement template-shift in PATCH handler**

When request body has `scope: 'all'` AND event is recurring, additionally call `saveRecurrenceRule` with the shifted template.

- [ ] **Step 3: Test + typecheck + commit**

---

### Task B6: Chrome MCP E2E

- [ ] **Step 1: Boot dev server, sign in via Hylo as a non-admin owner**

(Check connection, navigate, read page.)

- [ ] **Step 2: Drag a non-recurring event to a new slot → verify reload preserves new time**

- [ ] **Step 3: Drag a recurring event → verify modal → choose "All events" → verify reload shifts all instances**

- [ ] **Step 4: Sign in as admin (non-creator) → verify drag handle absent on someone else's event**

- [ ] **Step 5: Commit screenshots / evidence + final commit**

```bash
git commit -m "positiva: cal-tz-drag — slice complete + E2E verified, ready to ship"
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
