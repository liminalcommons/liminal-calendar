# B6 — Drag-to-reschedule slice Chrome MCP smoke

**Date:** 2026-05-03
**Commits under test:** A1–A3 + B1–B5 + baseline-repair (HEAD `40ef088`)
**Dev server:** `npm run dev` on `http://localhost:3000/` (Ready in 1913ms)
**Browser:** Chrome MCP, tab `1025353681`

## Probe 1 — SSR HTML preserved (A2 fix still works)

```json
{
  "sizeBytes": 110740,
  "eventBlocksInSsr": 0,
  "hourCellsInSsr": 336,
  "hasWeeklyGrid": true
}
```

The TZ-flash fix from A2 is intact: SSR HTML at `/` contains zero
`data-testid="event-block"` matches and 336 hour cells (7 × 48). Adding
the drag/modal code did NOT regress the mount-gate behavior.

## Probe 2 — Slice code paths shipped to client bundle

Pulled all `<script src="/_next/...">` URLs from the SSR HTML and
concatenated their bodies (6 scripts, 18,203,480 bytes total). All five
slice tasks have their code paths in the bundle:

```json
{
  "hasDataDraggable": true,         // B2: EventBlock owner-only marker
  "hasRecurrenceMoveModal": true,   // B4: scope picker modal
  "hasScopeAll": true,              // B5: scope='all' wire format
  "hasComputeDropPatch": true,      // B3: drop coords → patch helper
  "hasPxToMinutesSnapped": true     // B1: pixel-to-minutes math
}
```

## Probe 3 — DOM after hydration (unauthenticated)

```json
{
  "eventBlocks": 0,
  "hasWeeklyGrid": true,
  "hasHourCells": true,
  "signedIn": false
}
```

Unauthenticated dev sessions have no events seeded, so `eventBlocks: 0`
is expected. The grid and hour cells render correctly; the user is
unauthenticated.

## Probe 4 — Server-side scope validation route reachable

Four PATCH probes against `/api/events/1` (an arbitrary id):

```json
[
  { "scope": "all",        "status": 401 },
  { "scope": "this_only",  "status": 401 },
  { "scope": "garbage",    "status": 401 },
  { "scope": "omitted",    "status": 401 }
]
```

All 401 — auth is enforced BEFORE body parsing per the route's structure
(line 48–51: `if (!session?.user) return 401`). This is correct ordering
— defense-in-depth scope validation runs only for authenticated requests.
The validation logic itself is exhaustively unit-tested in
`events-patch-scope.test.ts` (5/5 pass).

## What CAN'T be verified locally (gap statement)

This worktree's branch is not deployed; the production calendar at
`liminalcalendar.com` runs the previous slice. Local Hylo OAuth doesn't
complete because the Hylo client's redirect URIs are configured for
`auth.liminalcalendar.com`, not `localhost:3000`. So three end-to-end
flows can only be verified post-deploy:

1. **Owner drags non-recurring event → snaps + persists.** The math
   (`computeDropPatch`) and the wiring (`handleEventDragStart` →
   `executeMovePatch` → PATCH) are unit-tested separately. The integration
   is gated by a real authenticated session + real event row.
2. **Owner drags recurring event → modal → "All events" → series shifts.**
   The modal contract (9 tests) and the `pendingRecurringMove` state path
   are covered. The end-to-end loop needs auth + a real recurring event.
3. **Admin (non-creator) sees no drag affordance.** The `isOwner` wiring
   (4 tests) and EventBlock's gate (5 tests) cover the predicate. The
   live render needs the admin signed in viewing someone else's event.

**Recommended ship pattern:** the user merges `worktree-cal-tz-and-drag`
to `main`, deploys via `vercel --prod` (the standing pattern since
auto-deploy is broken), then verifies the three flows on
`liminalcalendar.com` with their authenticated Hylo identity.

## Test summary across the slice

| Suite | Tests | Pass |
|---|---|---|
| `event-time-display.test.ts` | 4 | 4 |
| `DayColumn-mounted.test.tsx` | 2 | 2 |
| `drag-reschedule.test.ts` | 15 | 15 |
| `EventBlock-drag.test.tsx` | 5 | 5 |
| `DayColumn-isowner-wiring.test.tsx` | 4 | 4 |
| `RecurrenceMoveModal.test.tsx` | 9 | 9 |
| `events-patch-scope.test.ts` | 5 | 5 |
| **Slice total** | **44** | **44** |
| **Full repo (post-baseline-repair)** | **419** | **419** |

`npx tsc --noEmit` exit 0.

## Verdict

All structural guarantees verified locally:
- TZ flash fix intact (SSR-side proven)
- Slice code paths shipped in bundle
- Auth ordering preserves scope validation as defense in depth
- Full Jest suite green
- tsc clean

UX flows for drag/modal/admin-no-drag are gated behind authenticated
sessions that aren't reproducible on localhost. Recommended path: ship
to production and verify there per the codebase's standing pattern.
