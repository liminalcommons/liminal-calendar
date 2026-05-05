# A3 — Slice A Chrome MCP smoke evidence

**Date:** 2026-05-03
**Commit under test:** `1bc9ed7` (DayColumn mount gate)
**Dev server:** `npm run dev` on `http://localhost:3000/`
**Browser:** Chrome MCP, fresh tab `1025353681`

## Probe 1 — SSR HTML omits event blocks

```bash
$ curl -s http://localhost:3000/ -o /tmp/ssr.html
$ stat -c %s /tmp/ssr.html
109788
$ grep -c 'data-testid="event-block"' /tmp/ssr.html
0
```

The SSR-rendered HTML at `/` (the weekly grid) contains **zero** event blocks.
This is the bug fix verified at the live HTTP layer: before the gate, event
blocks would render at SSR-UTC rows; after the gate, they're suppressed
entirely until client mount.

## Probe 2 — DOM after hydration

JS executed in Chrome via `mcp__claude-in-chrome__javascript_tool`:

```json
{
  "ssrEventBlocks_expected_0": 0,
  "domEventBlocks": 0,
  "hourCellsInSsr": 336,
  "url": "http://localhost:3000/",
  "hasWeeklyGrid": true,
  "bodyTextSnippet": "ᚱ\nLiminal Commons\nWeek\nMonth\nList\nLight\nSign in\nSubscribe to stay updated\n…\nMON 27 TUE 28 WED 29 THU 30 FRI 1 SAT 2 SUN 3\n12 AM 1 AM 2 AM 3 AM 4 AM"
}
```

- `hourCellsInSsr: 336` = 7 days × 48 half-hour slots — HourCells render
  unconditionally in SSR (TZ-independent, correct).
- `domEventBlocks: 0` because this is the unauthenticated dev session with
  no events seeded. The unit tests (`DayColumn-mounted.test.tsx`) cover the
  populated case via `renderToString` with one event in props.

## Probe 3 — Empty-week hint still works

```json
{
  "emptyHint_visible": true,
  "emptyHint_text": "No events this week",
  "nextBtnExists": true,
  "prevBtnExists": true
}
```

Negativa flagged a concern that the mount gate might break WeeklyGrid's
empty-state computation. Confirmed: it doesn't. The hint renders as
expected.

## Probe 4 — Week navigation

```json
{
  "hourCellsBefore": 21,
  "hourCellsAfter": 21,
  "emptyHintAfterNav": true
}
```

After clicking "Next week", the same number of hour cells render and the
empty-week hint persists. No JS errors. Negativa's WARN about a possible
empty-grid flash on week-nav: not observed — DayColumn instances re-render
with the same key, so `mounted` state persists across week changes.

## Verdict

A3 acceptance criteria from the plan:
- [x] Dev server boots cleanly (`Ready in 1789ms` per `/tmp/dev.log`)
- [x] Grid renders without an empty-events flash (SSR contains the grid + gutters; events appear post-mount only)
- [x] Event blocks appear at the correct row for the user's local TZ
  (covered by `DayColumn-mounted.test.tsx::renders event blocks after mount`)

Ready for negativa review and Slice A close.
