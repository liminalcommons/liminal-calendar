/**
 * event_types repo — Task 2 of Plan 3 (1:1 Booking).
 *
 * EventTypeInput is the zod schema for create/update payloads. Helpers
 * read by the canonical `ownerMemberId` (integer FK to members.id) per
 * the Phase-3 identity canonicalization plan; writers must still
 * dual-write `ownerId` (legacy text column) to satisfy the
 * `event_types_owner_slug_unique` constraint until Phase 4.
 */

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventTypes } from '@/lib/db/schema';

export const EventTypeInput = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,49}$/, 'slug: lowercase alphanumeric+hyphen, 2-50'),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(480),
  locationKind: z.enum(['castalia', 'external_link', 'in_person']),
  locationValue: z.string().max(500).optional().nullable(),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 30).default(60),
  maxDaysAhead: z.number().int().min(1).max(365).default(30),
});

export type EventTypeInputT = z.infer<typeof EventTypeInput>;

export async function listMyEventTypes(memberId: number) {
  return db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.ownerMemberId, memberId), eq(eventTypes.active, true)));
}

export async function getEventTypeBySlug(memberId: number, slug: string) {
  const [row] = await db
    .select()
    .from(eventTypes)
    .where(
      and(
        eq(eventTypes.ownerMemberId, memberId),
        eq(eventTypes.slug, slug),
        eq(eventTypes.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}
