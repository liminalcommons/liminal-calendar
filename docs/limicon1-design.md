# Limicon1 — design (experiment branch `erik/experiment-20260930`)

One-month conference calendar on top of the permanent Liminal calendar.
One app, one database — a conference is a record plus a scope on events, not a fork.

## URL

Conference section at `/c/limicon1` (layout + branding + 4 views). Test URL is the
branch preview: `<preview-url>/c/limicon1`. No subdomain, no second deploy.

## Data model (all additive, nullable)

- `conferences`: `id, slug unique, name, starts_at, ends_at, status, created_at`.
  Seed row: slug `limicon1`, status `active` during the month, `ended` after.
- `events.conference_id` FK → `conferences.id`, nullable. Set = Limicon event.
  NULL = permanent-calendar event. **Transfer = set NULL. End-of-conference =
  exclude non-transferred conference events from every query.** No deletion.
- `events.continue_beyond` boolean default false — the "continues beyond Limicon"
  tick-box; flags transfer candidates for the admin list.
- `events.category` text nullable: `speaker | practice | audience | other`;
  `events.category_other` text nullable (free text when `other`).
- No role migration: `members.role` is free text; `governor` is just a new value.

## Visibility — new `members` tier

`public` today means visible to signed-out visitors, so Limicon events (visible
to all members, NOT public) need a third value: `visibility = 'members'`.

- `visibleEventsForMemberCondition` gains `OR events.visibility = 'members'`
  (any authenticated member sees them; creator/RSVP/invite branches unchanged).
- `publicOnlyEventsCondition` unchanged → signed-out visitors never see them.
- Embed 404s non-public already → `members` events not embeddable. Good.
- Broadcast skips only `private` → `members` events notify like public. Keep.

Existing permanent events need no backfill: Limicon views query the conference
window, so current public events in that window "absorb" automatically.

## Permissions

- Roles become `member | host | admin | governor`.
- Members can already create/edit/delete their own events; the publish gate is
  `canCreatePublicEvent`. New helper `canPublishToConference(role, conference)`:
  any authenticated role may publish `visibility='members'` **with
  `conference_id` set** while that conference is `active`. Window closing *is*
  the permission being taken away — no promotion, no revert, no demotion risk.
- Normal `public` gate unchanged: members can never publish to the open internet.
- EventForm role guard opens for conference creation (member + active conference);
  the plain `/events/new` path stays host/admin-only.
- `POST /api/admin/members/[id]/role` → `canAssignRole(caller, target)`:
  governor may assign any role (incl. admin/governor); admin may assign member/host
  only; everyone else nothing. Admin keeps edit-any-event, all else unchanged.
- Governor seeding (Erik + Danielle Johnson) is a data write, done explicitly after
  looking up their member rows — not in a migration.

## Event form changes

- Category select: Speaker presentation / Practice ritual / Audience
  participation / Other (please specify) + conditional text input.
- "Continues beyond Limicon" checkbox → `continue_beyond` (conference mode only).
- Visibility control in conference mode: `members` (default; all members see it,
  not public). Public option only for host/admin as today.

## Views (shared components, conference-aware)

- New page: next-24-hours (`/upcoming` + `/c/[slug]/upcoming`) — rolling 24h.
- List (`/list` + conference): infinite bottomless scroll (IntersectionObserver +
  existing `limit/offset` API params), replacing the fixed 3-day/20-item window.
- Week: density pass for a crowded month — compact chips with category colour
  bar, per-day `+N more` overflow popover, tighter padding. Same `WeeklyGrid`.
- Month: category colours (speaker gold, practice green, audience blue, other
  plum), via shared `categoryMeta` helper; uncategorised keeps hash colours.
- Four views everywhere: 24h / list / week / month. Conference layout reuses the
  same components with a `conference` filter.

## End of Limicon + retention

- Admin conference panel: list `continue_beyond` flagged events → **Retain**
  (clears `conference_id`, keeps visibility) or leave to expire.
- `status='ended'`: conference routes show an "ended" state; every event query
  excludes rows whose conference is ended and still linked. Retained rows
  (conference_id NULL) live on as normal permanent events.

## Phases

1. Schema + migration. 2. Permissions/visibility. 3. Events + admin API.
4. EventForm. 5. Views. 6. Governor seeding. 7. Verify (typecheck, jest, local
   query test, push, preview URL, HTTP e2e).
