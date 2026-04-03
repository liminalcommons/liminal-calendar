# Availability + Smart Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set weekly availability on a profile page; when creating events with invitees, suggest optimal times based on availability overlap.

**Architecture:** New `availability` and `timezone` columns on the `members` table store per-user weekly slots (JSON array of 0-335 UTC slot indices). A pure-function scheduling algorithm computes overlap across invitees. Profile page uses a paintable 7x48 grid. Full event creation page (`/events/new`) has two-column layout with invitee picker + scheduling suggestions.

**Tech Stack:** Next.js 15, Tailwind CSS, Drizzle ORM, Neon Postgres, grove theme CSS vars.

---

### Task 1: DB schema — add timezone + availability to members

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/migrate.ts`

- [ ] **Step 1: Add columns to schema**

In `src/lib/db/schema.ts`, add `timezone` and `availability` to the members table:

```typescript
export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  hyloId: text('hylo_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email'),
  image: text('image'),
  role: text('role').notNull().default('member'),
  timezone: text('timezone').default('UTC'),
  availability: text('availability').default('[]'), // JSON array of UTC slot indices 0-335
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

Note: Using `text` for availability (JSON string) rather than `jsonb` since Drizzle + Neon serverless handles text more reliably. Parse on read.

- [ ] **Step 2: Add migration SQL**

In `src/lib/db/migrate.ts`, add after the members CREATE TABLE:

```typescript
  // Add timezone and availability columns to members (idempotent)
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'`;
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '[]'`;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean (no errors)

- [ ] **Step 4: Run migration against production DB**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.calender_DATABASE_URL || '<db-url>');
Promise.all([
  sql\`ALTER TABLE members ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'\`,
  sql\`ALTER TABLE members ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '[]'\`,
]).then(() => console.log('done')).catch(e => console.error(e));
"
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrate.ts
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat(db): add timezone + availability columns to members table"
```

---

### Task 2: Profile API — GET/PATCH own profile

**Files:**
- Create: `src/app/api/profile/route.ts`

- [ ] **Step 1: Create profile API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hyloId = (session.user as any).hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'No Hylo ID' }, { status: 400 });
  }

  try {
    const [member] = await db.select().from(members).where(eq(members.hyloId, hyloId)).limit(1);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    return NextResponse.json({
      hyloId: member.hyloId,
      name: member.name,
      email: member.email,
      image: member.image,
      timezone: member.timezone ?? 'UTC',
      availability: JSON.parse(member.availability ?? '[]'),
    });
  } catch (err) {
    console.error('[GET /api/profile]', err);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hyloId = (session.user as any).hyloId as string | undefined;
  if (!hyloId) {
    return NextResponse.json({ error: 'No Hylo ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { timezone, availability } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof timezone === 'string' && timezone.length > 0) {
    updates.timezone = timezone;
  }

  if (Array.isArray(availability)) {
    const valid = availability.every(s => typeof s === 'number' && s >= 0 && s <= 335);
    if (!valid) {
      return NextResponse.json({ error: 'availability slots must be numbers 0-335' }, { status: 400 });
    }
    updates.availability = JSON.stringify(availability);
  }

  try {
    const [updated] = await db
      .update(members)
      .set(updates)
      .where(eq(members.hyloId, hyloId))
      .returning();

    return NextResponse.json({
      hyloId: updated.hyloId,
      name: updated.name,
      timezone: updated.timezone,
      availability: JSON.parse(updated.availability ?? '[]'),
    });
  } catch (err) {
    console.error('[PATCH /api/profile]', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/app/api/profile/route.ts
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat(api): GET/PATCH /api/profile — own timezone + availability"
```

---

### Task 3: Scheduling algorithm — pure function

**Files:**
- Create: `src/lib/scheduling.ts`

- [ ] **Step 1: Write the scheduling algorithm**

```typescript
export interface SchedulingSuggestion {
  day: string;           // "Monday", "Tuesday", etc.
  dayIndex: number;      // 0=Mon, 6=Sun
  startSlot: number;     // 0-335
  startTime: string;     // "14:00" UTC
  endTime: string;       // "15:30" UTC
  available: number;
  total: number;
  missing: { name: string; hyloId: string }[];
}

interface MemberAvailability {
  hyloId: string;
  name: string;
  availability: number[]; // UTC slot indices
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function slotToTime(slot: number): string {
  const daySlot = slot % 48;
  const hour = Math.floor(daySlot / 2);
  const min = (daySlot % 2) * 30;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function findBestTimes(
  membersAvail: MemberAvailability[],
  durationMinutes: number,
  maxResults = 5,
): SchedulingSuggestion[] {
  if (membersAvail.length === 0) return [];

  const slotsNeeded = Math.ceil(durationMinutes / 30);
  const total = membersAvail.length;

  // Build a count array: for each of 336 slots, how many members are available
  const counts = new Array(336).fill(0);
  const availSets = membersAvail.map(m => new Set(m.availability));

  for (const avSet of availSets) {
    for (const slot of avSet) {
      if (slot >= 0 && slot < 336) counts[slot]++;
    }
  }

  // Find all valid contiguous windows of length slotsNeeded
  const candidates: { startSlot: number; minCount: number; avgCount: number }[] = [];

  for (let start = 0; start <= 336 - slotsNeeded; start++) {
    // Don't span across day boundaries
    const startDay = Math.floor(start / 48);
    const endDay = Math.floor((start + slotsNeeded - 1) / 48);
    if (startDay !== endDay) continue;

    let minCount = Infinity;
    let sumCount = 0;
    for (let i = 0; i < slotsNeeded; i++) {
      const c = counts[start + i];
      if (c < minCount) minCount = c;
      sumCount += c;
    }

    if (minCount > 0) {
      candidates.push({ startSlot: start, minCount, avgCount: sumCount / slotsNeeded });
    }
  }

  // Sort: highest minCount first, then highest avgCount
  candidates.sort((a, b) => {
    if (b.minCount !== a.minCount) return b.minCount - a.minCount;
    return b.avgCount - a.avgCount;
  });

  // Deduplicate: skip candidates that overlap with already-selected ones
  const selected: typeof candidates = [];
  for (const cand of candidates) {
    const overlaps = selected.some(s =>
      cand.startSlot < s.startSlot + slotsNeeded && cand.startSlot + slotsNeeded > s.startSlot
    );
    if (!overlaps) {
      selected.push(cand);
      if (selected.length >= maxResults) break;
    }
  }

  // Build results
  return selected.map(({ startSlot }) => {
    const dayIndex = Math.floor(startSlot / 48);
    const endSlot = startSlot + slotsNeeded - 1;

    // Find who's missing (not available for ALL slots in the window)
    const missing: { name: string; hyloId: string }[] = [];
    let availCount = 0;
    for (let mi = 0; mi < membersAvail.length; mi++) {
      const avSet = availSets[mi];
      let allAvail = true;
      for (let s = startSlot; s <= endSlot; s++) {
        if (!avSet.has(s)) { allAvail = false; break; }
      }
      if (allAvail) {
        availCount++;
      } else {
        missing.push({ name: membersAvail[mi].name, hyloId: membersAvail[mi].hyloId });
      }
    }

    return {
      day: DAY_NAMES[dayIndex],
      dayIndex,
      startSlot,
      startTime: slotToTime(startSlot),
      endTime: slotToTime(startSlot + slotsNeeded),
      available: availCount,
      total,
      missing,
    };
  });
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduling.ts
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat: scheduling algorithm — find best times from invitee availability overlap"
```

---

### Task 4: Scheduling suggestion API

**Files:**
- Create: `src/app/api/scheduling/suggest/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { findBestTimes } from '@/lib/scheduling';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!canCreateEvents(getUserRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { inviteeIds, durationMinutes } = body as Record<string, unknown>;

  if (!Array.isArray(inviteeIds) || inviteeIds.length === 0) {
    return NextResponse.json({ error: 'inviteeIds required' }, { status: 400 });
  }
  const duration = typeof durationMinutes === 'number' ? durationMinutes : 60;

  try {
    const invitees = await db.select({
      hyloId: members.hyloId,
      name: members.name,
      availability: members.availability,
    }).from(members).where(inArray(members.hyloId, inviteeIds as string[]));

    const membersAvail = invitees.map(m => ({
      hyloId: m.hyloId,
      name: m.name,
      availability: JSON.parse(m.availability ?? '[]') as number[],
    }));

    const suggestions = findBestTimes(membersAvail, duration);
    return NextResponse.json(suggestions);
  } catch (err) {
    console.error('[POST /api/scheduling/suggest]', err);
    return NextResponse.json({ error: 'Failed to compute suggestions' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scheduling/suggest/route.ts
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat(api): POST /api/scheduling/suggest — ranked time suggestions from invitee overlap"
```

---

### Task 5: AvailabilityGrid component — paintable weekly grid

**Files:**
- Create: `src/components/availability/AvailabilityGrid.tsx`

- [ ] **Step 1: Create the paintable grid component**

```typescript
'use client';

import React, { useState, useCallback, useRef } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS_PER_DAY = 48;

interface AvailabilityGridProps {
  value: number[];          // UTC slot indices 0-335
  onChange: (slots: number[]) => void;
  timezone: string;
}

function utcSlotToLocal(utcSlot: number, tzOffsetMinutes: number): number {
  const offsetSlots = Math.round(tzOffsetMinutes / 30);
  let local = utcSlot + offsetSlots;
  if (local < 0) local += 336;
  if (local >= 336) local -= 336;
  return local;
}

function localSlotToUtc(localSlot: number, tzOffsetMinutes: number): number {
  const offsetSlots = Math.round(tzOffsetMinutes / 30);
  let utc = localSlot - offsetSlots;
  if (utc < 0) utc += 336;
  if (utc >= 336) utc -= 336;
  return utc;
}

function getTzOffset(timezone: string): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = now.toLocaleString('en-US', { timeZone: timezone });
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
}

function formatHour(slot: number): string {
  const h = Math.floor((slot % SLOTS_PER_DAY) / 2);
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export function AvailabilityGrid({ value, onChange, timezone }: AvailabilityGridProps) {
  const offset = getTzOffset(timezone);
  const localSet = new Set(value.map(s => utcSlotToLocal(s, offset)));

  const [painting, setPainting] = useState(false);
  const paintModeRef = useRef<'add' | 'remove'>('add');

  const toggle = useCallback((localSlot: number) => {
    const next = new Set(localSet);
    if (next.has(localSlot)) {
      next.delete(localSlot);
    } else {
      next.add(localSlot);
    }
    onChange(Array.from(next).map(s => localSlotToUtc(s, offset)));
  }, [localSet, offset, onChange]);

  const handleMouseDown = useCallback((localSlot: number) => {
    setPainting(true);
    paintModeRef.current = localSet.has(localSlot) ? 'remove' : 'add';
    toggle(localSlot);
  }, [localSet, toggle]);

  const handleMouseEnter = useCallback((localSlot: number) => {
    if (!painting) return;
    const isSet = localSet.has(localSlot);
    if (paintModeRef.current === 'add' && !isSet) toggle(localSlot);
    if (paintModeRef.current === 'remove' && isSet) toggle(localSlot);
  }, [painting, localSet, toggle]);

  const handleMouseUp = useCallback(() => setPainting(false), []);

  // Show hours 6am-11pm (slots 12-46) — most relevant range
  const visibleStart = 12; // 6 AM
  const visibleEnd = 46;   // 11 PM

  return (
    <div
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="grid gap-px" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div />
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-grove-text-muted py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid gap-px bg-grove-border/30 rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}
      >
        {Array.from({ length: visibleEnd - visibleStart + 1 }, (_, ri) => {
          const slotInDay = visibleStart + ri;
          const isHourBoundary = slotInDay % 2 === 0;

          return (
            <React.Fragment key={ri}>
              {/* Time label */}
              <div className={`flex items-center justify-end pr-2 text-[9px] text-grove-text-muted font-mono bg-grove-bg ${isHourBoundary ? '' : 'opacity-0'}`}
                   style={{ height: 18 }}>
                {isHourBoundary ? formatHour(slotInDay) : ''}
              </div>

              {/* Day cells */}
              {DAYS.map((_, di) => {
                const localSlot = di * SLOTS_PER_DAY + slotInDay;
                const isAvailable = localSet.has(localSlot);

                return (
                  <div
                    key={di}
                    className={`cursor-pointer transition-colors ${
                      isAvailable
                        ? 'bg-grove-green/40 hover:bg-grove-green/50'
                        : 'bg-grove-bg hover:bg-grove-border/20'
                    } ${isHourBoundary ? 'border-t border-grove-border/30' : ''}`}
                    style={{ height: 18 }}
                    onMouseDown={() => handleMouseDown(localSlot)}
                    onMouseEnter={() => handleMouseEnter(localSlot)}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex gap-4 mt-2 text-[10px] text-grove-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-green/40" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-bg border border-grove-border/30" /> Not set
        </span>
        <span className="ml-auto">Click or drag to paint</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/availability/AvailabilityGrid.tsx
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat: AvailabilityGrid — paintable weekly grid with drag support"
```

---

### Task 6: Profile page — timezone + availability

**Files:**
- Create: `src/app/profile/page.tsx`
- Modify: `src/components/NavBar.tsx` (add profile link on avatar)

- [ ] **Step 1: Create profile page**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { AvailabilityGrid } from '@/components/availability/AvailabilityGrid';
import { apiFetch } from '@/lib/api-fetch';

const COMMON_TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Berlin',
  'Europe/Helsinki', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [timezone, setTimezone] = useState('UTC');
  const [availability, setAvailability] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { router.replace('/'); return; }

    // Auto-detect timezone
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

    apiFetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (data.timezone && data.timezone !== 'UTC') {
          setTimezone(data.timezone);
        } else {
          setTimezone(detected);
        }
        if (Array.isArray(data.availability)) {
          setAvailability(data.availability);
        }
        setLoading(false);
      })
      .catch(() => {
        setTimezone(detected);
        setLoading(false);
      });
  }, [status, router]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, availability }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // silent
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const user = session?.user as any;

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-4 transition-colors"
        >
          ← Back
        </button>

        <div className="flex items-center gap-4 mb-8">
          {user?.image ? (
            <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-lg font-semibold">
              {(user?.name || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-serif text-grove-text">{user?.name || 'Your Profile'}</h1>
            <p className="text-sm text-grove-text-muted">{user?.email}</p>
          </div>
        </div>

        {/* Timezone */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider mb-2">Your Timezone</h2>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full max-w-sm text-sm bg-grove-surface border border-grove-border rounded-lg px-3 py-2
                       text-grove-text focus:outline-none focus:ring-1 focus:ring-grove-accent"
          >
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz} value={tz} className="bg-grove-surface text-grove-text">{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Availability grid */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider mb-2">Weekly Availability</h2>
          <p className="text-xs text-grove-text-muted mb-4">
            Mark the times you're generally available. This helps others find the best time for events.
          </p>
          {loading ? (
            <div className="h-64 bg-grove-surface rounded-lg animate-pulse" />
          ) : (
            <AvailabilityGrid
              value={availability}
              onChange={setAvailability}
              timezone={timezone}
            />
          )}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-medium
                     hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add profile link to NavBar avatar**

In `src/components/NavBar.tsx`, wrap the avatar div in a Link. Change lines 148-160 from a plain `<div>` to:

```typescript
            {/* Avatar + role badge — links to profile */}
            <Link
              href="/profile"
              className="flex items-center gap-1.5"
              title="Your profile & availability"
            >
              <div
                className="w-7 h-7 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-xs font-semibold select-none"
              >
                {initials}
              </div>
              {roleLabel && (
                <span className="text-[10px] font-medium text-grove-accent-deep bg-grove-border/50 px-1.5 py-0.5 rounded-full">
                  {roleLabel}
                </span>
              )}
            </Link>
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/page.tsx src/components/NavBar.tsx
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat: profile page — timezone picker + paintable availability grid"
```

---

### Task 7: InviteePicker + SchedulingSuggestions components

**Files:**
- Create: `src/components/events/InviteePicker.tsx`
- Create: `src/components/events/SchedulingSuggestions.tsx`

- [ ] **Step 1: Create InviteePicker**

```typescript
'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

export interface PickedMember {
  hyloId: string;
  name: string;
  image: string | null;
}

interface InviteePickerProps {
  selected: PickedMember[];
  onChange: (members: PickedMember[]) => void;
  disabled?: boolean;
}

export function InviteePicker({ selected, onChange, disabled }: InviteePickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedMember[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/admin/members`);
        if (res.ok) {
          const data = await res.json();
          const selectedIds = new Set(selected.map(s => s.hyloId));
          const filtered = (data as any[])
            .filter(m => m.name.toLowerCase().includes(q.toLowerCase()) && !selectedIds.has(m.hyloId))
            .slice(0, 8)
            .map(m => ({ hyloId: m.hyloId, name: m.name, image: m.image }));
          setResults(filtered);
        }
      } catch {} finally { setSearching(false); }
    }, 200);
  }, [selected]);

  const add = (member: PickedMember) => {
    onChange([...selected, member]);
    setResults(prev => prev.filter(r => r.hyloId !== member.hyloId));
    setQuery('');
  };

  const remove = (hyloId: string) => {
    onChange(selected.filter(s => s.hyloId !== hyloId));
  };

  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-grove-text-muted" />
        <input
          type="text"
          placeholder="Search members to invite..."
          value={query}
          onChange={e => handleSearch(e.target.value)}
          disabled={disabled}
          className="w-full pl-9 pr-4 py-2 text-sm bg-grove-surface border border-grove-border rounded-lg
                     text-grove-text placeholder:text-grove-text-dim
                     focus:outline-none focus:ring-1 focus:ring-grove-accent disabled:opacity-50"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-grove-text-muted">...</span>}
      </div>

      {results.length > 0 && (
        <div className="mt-1 bg-grove-surface border border-grove-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.hyloId}
              onClick={() => add(r)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-grove-border/20 transition-colors"
            >
              {r.image ? (
                <img src={r.image} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-grove-accent/20 flex items-center justify-center text-[9px] font-semibold text-grove-accent-deep">
                  {r.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-grove-text">{r.name}</span>
            </button>
          ))}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(s => (
            <span key={s.hyloId} className="inline-flex items-center gap-1 bg-grove-green/20 text-grove-green text-xs px-2 py-1 rounded-full">
              {s.name}
              <button onClick={() => remove(s.hyloId)} className="hover:text-red-400"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create SchedulingSuggestions**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import type { SchedulingSuggestion } from '@/lib/scheduling';

interface SchedulingSuggestionsProps {
  inviteeIds: string[];
  durationMinutes: number;
  onSelect: (suggestion: SchedulingSuggestion) => void;
}

export function SchedulingSuggestions({ inviteeIds, durationMinutes, onSelect }: SchedulingSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SchedulingSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inviteeIds.length === 0) { setSuggestions([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/scheduling/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteeIds, durationMinutes }),
        });
        if (res.ok) {
          setSuggestions(await res.json());
        }
      } catch {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteeIds, durationMinutes]);

  if (inviteeIds.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Clock size={12} className="text-grove-accent" />
        <span className="text-[11px] font-semibold text-grove-accent uppercase tracking-wider">Best Times</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 bg-grove-border/20 rounded-lg animate-pulse" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-xs text-grove-text-muted italic py-4 text-center">
          {inviteeIds.length > 0 ? 'No common availability found. Invitees may not have set their availability yet.' : 'Add invitees to see suggestions.'}
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelect(s)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                s.available === s.total
                  ? 'bg-grove-green/10 border-grove-green/30 hover:bg-grove-green/20'
                  : 'bg-grove-surface border-grove-border hover:bg-grove-border/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-grove-text">
                  {s.day} {s.startTime} – {s.endTime} UTC
                </span>
                <span className="flex items-center gap-1 text-xs text-grove-text-muted">
                  <Users size={10} />
                  {s.available}/{s.total}
                </span>
              </div>
              {s.missing.length > 0 && (
                <p className="text-[10px] text-grove-text-muted mt-1">
                  Missing: {s.missing.map(m => m.name).join(', ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add src/components/events/InviteePicker.tsx src/components/events/SchedulingSuggestions.tsx
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat: InviteePicker + SchedulingSuggestions components"
```

---

### Task 8: Full event creation page — two-column layout

**Files:**
- Create: `src/app/events/new/page.tsx` (replace existing if any)

- [ ] **Step 1: Check if /events/new/page.tsx exists**

Run: `cat src/app/events/new/page.tsx 2>/dev/null | head -5`

If it exists, read it first and preserve any routing logic. Then rewrite with two-column layout.

- [ ] **Step 2: Create two-column event creation page**

Create `src/app/events/new/page.tsx` with:
- Left column: title, description, datetime, duration, meeting link, recurrence, Hylo toggle, create button
- Right column: InviteePicker + SchedulingSuggestions
- When a suggestion is clicked, auto-fill the date/time
- Quick create popover link: "More options →" navigates here with query params `?day=YYYY-MM-DD&slot=N`

(Full code in implementation — this is the largest component, ~200 lines following existing patterns from QuickCreatePopover.tsx and admin/page.tsx)

- [ ] **Step 3: Add "More options" link to QuickCreatePopover**

In `src/components/calendar/QuickCreatePopover.tsx`, add a link before the Create button:

```typescript
<Link
  href={`/events/new?day=${format(day, 'yyyy-MM-dd')}&slot=${hour}`}
  className="text-xs text-grove-accent-deep hover:text-grove-accent transition-colors"
  onClick={onClose}
>
  More options →
</Link>
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/app/events/new/page.tsx src/components/calendar/QuickCreatePopover.tsx
git commit --author="Florin <accounts@liminalcommons.com>" -m "feat: full event creation page — two-column with invitees + smart scheduling"
```

---

### Task 9: Deploy + E2E verify

- [ ] **Step 1: Push and deploy**

```bash
git push origin main && npx vercel --prod
```

- [ ] **Step 2: Run migration on production**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon('<db-url>');
Promise.all([
  sql\`ALTER TABLE members ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'\`,
  sql\`ALTER TABLE members ADD COLUMN IF NOT EXISTS availability TEXT DEFAULT '[]'\`,
]).then(() => console.log('done'));
"
```

- [ ] **Step 3: Browser verify — profile page**

Navigate to `calendar.castalia.one/profile`:
- Timezone picker renders with auto-detected timezone
- Availability grid renders with click/drag painting
- Save persists and reloads correctly

- [ ] **Step 4: Browser verify — event creation**

Navigate to `calendar.castalia.one/events/new`:
- Two-column layout renders
- Invitee search works
- Scheduling suggestions appear when invitees have availability set
- Clicking a suggestion auto-fills date/time

- [ ] **Step 5: Browser verify — quick create popover**

Click a grid cell on weekly view:
- "More options →" link visible
- Clicking it navigates to /events/new with time pre-filled
