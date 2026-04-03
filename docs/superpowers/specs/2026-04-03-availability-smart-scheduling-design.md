# Availability + Smart Scheduling — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Users set their weekly availability on a profile page. When creating events with invitees, the system finds optimal time slots by computing overlap across all invitees' availability.

## Data Model

### Members table changes

Add two columns to the existing `members` table:

```sql
ALTER TABLE members ADD COLUMN timezone TEXT DEFAULT 'UTC';
ALTER TABLE members ADD COLUMN availability JSONB DEFAULT '[]';
```

- `timezone`: IANA timezone string (e.g., "America/Los_Angeles")
- `availability`: JSON array of UTC slot indices (0-335) where the user is available
  - 0 = Monday 00:00 UTC, 1 = Monday 00:30 UTC, ..., 47 = Monday 23:30 UTC
  - 48 = Tuesday 00:00 UTC, ..., 335 = Sunday 23:30 UTC
  - 336 total slots per week (7 days x 48 half-hour slots)

### Slot index formula

```
slotIndex = dayOfWeek * 48 + hour * 2 + (minute >= 30 ? 1 : 0)
```

Where dayOfWeek: 0=Mon, 1=Tue, ..., 6=Sun.

## Pages & Components

### 1. Profile Page (`/profile`)

**Access:** Any authenticated user (own profile only).

**Layout:**
- Back to Calendar link
- Timezone picker — auto-detected from `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable dropdown
- Weekly availability grid — 7 columns (Mon-Sun) x 48 rows (30-min slots)
  - Click to toggle a slot
  - Click + drag to paint multiple slots
  - Visual: available slots = teal fill, empty = dark
  - Hour labels on left gutter (every hour)
  - Day labels on top
- Save button — persists timezone + availability to DB

**Nav access:** Click avatar in nav → links to /profile.

### 2. Full Event Creation (`/events/new`)

**Access:** Host and admin roles only.

**Layout:** Two-column split.

**Left column — Event form:**
- Title (required)
- Description (textarea)
- Date & time picker
- Duration dropdown (30min, 1hr, 1.5hr, 2hr, 3hr)
- Meeting link (optional)
- Recurrence (none, daily, weekly, fortnightly, monthly)
- Post to Hylo group toggle
- Create Event button

**Right column — Invitees + Scheduling:**
- Member search input (searches `members` table, not Hylo)
- Selected invitees shown as pills with remove button
- Smart scheduling panel (appears when invitees are added):
  - Top 3 ranked time suggestions
  - Each shows: day + time (in host's timezone), attendance fraction, who's missing
  - Click a suggestion → auto-fills date/time in the form

**Quick create popover** keeps existing behavior + adds "More options →" link that navigates to `/events/new` with the selected day/time pre-filled.

### 3. Smart Scheduling Algorithm

**Input:** List of invitee hyloIds, event duration in minutes.

**Process:**

1. Fetch availability arrays for all invitees from DB
2. For each of the 336 weekly slots, count how many invitees have that slot in their availability array
3. Find contiguous runs of slots where count > 0, with length >= ceil(duration / 30)
4. For each valid window, compute:
   - `score = availableCount / totalInvitees`
   - `penalty` = small penalty for very early/late hours in host's timezone
5. Sort by score descending, then by penalty ascending
6. Return top 5 suggestions with: day, startTime, endTime (in UTC), availableCount, missingMembers[]

**Output format:**
```json
[
  {
    "day": "Saturday",
    "startSlot": 172,
    "startTime": "14:00",
    "endTime": "15:30",
    "available": 3,
    "total": 3,
    "missing": []
  },
  {
    "day": "Tuesday",
    "startSlot": 80,
    "startTime": "16:00",
    "endTime": "17:30",
    "available": 2,
    "total": 3,
    "missing": [{"name": "James B", "hyloId": "12345"}]
  }
]
```

## API Endpoints

### `GET /api/profile`
- Auth: any authenticated user
- Returns: own member record with timezone + availability

### `PATCH /api/profile`
- Auth: any authenticated user
- Body: `{ timezone?: string, availability?: number[] }`
- Validates: timezone is valid IANA string, availability slots are 0-335
- Updates own member record

### `GET /api/members/:hyloId/availability`
- Auth: any authenticated user
- Returns: `{ timezone, availability }` for the specified member

### `POST /api/scheduling/suggest`
- Auth: host or admin
- Body: `{ inviteeIds: string[], durationMinutes: number }`
- Returns: array of top 5 ranked time suggestions (see algorithm output above)

## UI Components

### AvailabilityGrid
- Props: `value: number[]`, `onChange: (slots: number[]) => void`, `timezone: string`
- Renders 7x48 grid with click/drag painting
- Converts between local display and UTC storage
- Used on /profile page

### InviteePicker
- Props: `selected: Member[]`, `onChange: (members: Member[]) => void`
- Searches members table with debounced input
- Shows pills for selected members
- Used on /events/new page

### SchedulingSuggestions
- Props: `inviteeIds: string[]`, `durationMinutes: number`, `onSelect: (day, time) => void`
- Calls POST /api/scheduling/suggest
- Renders ranked suggestion cards
- Click a card → calls onSelect with the time
- Used on /events/new page

## File Structure

```
src/
  app/
    profile/page.tsx          — Profile page
    events/new/page.tsx       — Full event creation (two-column)
    api/
      profile/route.ts        — GET/PATCH own profile
      scheduling/
        suggest/route.ts      — POST smart scheduling
  components/
    availability/
      AvailabilityGrid.tsx    — Paintable weekly grid
    events/
      InviteePicker.tsx       — Member search + pills
      SchedulingSuggestions.tsx — Ranked time cards
      FullEventForm.tsx       — Two-column creation form
  lib/
    scheduling.ts             — Overlap algorithm (pure function, testable)
```

## Testing

- Unit tests for scheduling algorithm (overlap computation, ranking)
- Type check all new files
- Browser verification: /profile page renders grid, /events/new shows two-column layout
- E2E: set availability for 2+ test users, create event with invitees, verify suggestions appear
