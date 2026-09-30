# Analytics scoreboard — design

Scope approved by Erik 2026-09-30: full scoreboard (fixes + guest journey + per-event).
Source: Claude Code review of `AnalyticsPanel.tsx` / `aggregate.ts` / `repo.ts`,
verified against source (returning-visitors bug and admin-traffic pollution confirmed).

## Goal
Turn the admin Analytics tab from vanity traffic tiles into an organiser's tool:
which events get discovered, and what guests do next. Plain counts everywhere —
at single-digit daily traffic every rate is noise.

## Non-goals
No external chart lib (stay self-contained like now). No per-user tracking
beyond today's anonymous visitor id. No touching the nlb bot repo.

## Phase A — correctness fixes
1. **Fix new/returning.** `firstSeen` is built from the loaded 30-day rows, so in
   the month window everyone looks new (returning always 0). Fix: one extra
   query `MIN(created_at) GROUP BY visitor_id` (or a per-visitor first-seen
   lookup capped to visitors in window) and compute against full history.
2. **Exclude internal traffic.** Drop paths starting with `/admin` and target
   `admin:self-test` from all counts (collect stays, aggregate filters — keeps
   the pipeline test working while keeping numbers honest). Label the exclusion
   in the footer note.
3. **Remove bounce-rate tile.** Replace with "visits reaching an event page"
   (visits with ≥1 pageview under `/events/`): the depth measure that matters.
4. **Window selector drives everything.** 7 / 30 / 90 days for tiles, trend, and
   ranked lists (today the lower sections are fixed at 30d with no on-screen
   note). Previous-period comparison as raw counts ("12 vs 8"), never %.
5. **Trend buckets by week** when window is 30d+ (daily bars at this volume are
   0s and 1s); add max-value label; zero days render flat at 0 (today's 2%
   minimum height makes 0 look like 1).

## Phase B — guest journey (plain counts, no percentages)
Funnel strip: guest entries → guests viewing an event → guest RSVPs → became
members. Each step joins within the selected window; "became members" joins
`members.created_at` against prior guest visitor ids where linkable, else counts
new members in-window and says so.
`?ref=` attribution: beacon already posts `path` — parse a `ref` query param in
`collect-handler` into a new nullable `analytics_events.ref` column (additive
migration, null = direct/unknown). Ranked "brought by" list credits newsletter,
Discord, Signal posts. Touch `track.ts` + `collect/route.ts` + `pulse/route.ts`
only.

## Phase C — per-event scoreboard
Join analytics paths matching `/events/<id>` to the `events` table. Two tables:
- **Upcoming (next 14d by `starts_at`):** title, date, views, unique viewers,
  RSVPs yes / interested, guest RSVPs (rsvp with null `member_id`), top referrer.
- **Past 30d:** same + attendance where reported.
Rows link to the event page. Events with zero views still list (RSVPs without
views are signal, not an error).

## API changes (`/api/admin/analytics`)
Add `?window=7|30|90`. Response gains `funnel`, `eventScoreboard {upcoming, past}`,
`refs`, `visitsToEvents`. Existing fields stay (panel keeps working during rollout).
`repo.ts` takes the window; row cap stays 50k newest-first.

## Tests
Extend the existing suites (`admin-analytics-health`, `analytics-pulse-route`
patterns): aggregate unit tests for new/returning against out-of-window first
sightings, admin-path exclusion, funnel counts, `/events/<id>` join incl.
non-numeric ids ignored. Pipeline self-test keeps working (its click is
filtered from display, asserted in test).

## Verify
Local scratch stack per `liminal-calendar-e2e` skill (local DB + minted admin
cookie, zero production writes) → screenshot of each window + scoreboard tables
in chat. No proof = not done.
