/**
 * GET  /api/booking/event-types — list caller's active event types
 * POST /api/booking/event-types — create a new event type
 *
 * Task 2 of Plan 3 (1:1 Booking).
 *
 * Auth: getCurrentMember(db) — Logto-only canonical resolution.
 *
 * Dual-write: writes BOTH ownerMemberId (canonical integer FK) and
 * ownerId (legacy text column) to satisfy the existing unique
 * constraint `event_types_owner_slug_unique` on (owner_id, slug). The
 * legacy ownerId derives from the member's first non-null provider
 * identifier (logtoId / clerkId / hyloId) with stringified member.id
 * as a last-resort fallback. Reads use ownerMemberId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventTypes, type Member } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { EventTypeInput, listMyEventTypes } from '@/lib/booking/event-types-repo';

function legacyOwnerIdOf(member: Member): string {
  return (
    member.logtoId ??
    member.clerkId ??
    member.hyloId ??
    String(member.id)
  );
}

export async function GET() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await listMyEventTypes(member.id);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = EventTypeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const legacyOwnerId = legacyOwnerIdOf(member);

  try {
    const [created] = await db
      .insert(eventTypes)
      .values({
        ownerId: legacyOwnerId,
        ownerMemberId: member.id,
        ...parsed.data,
      })
      .returning();
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    // Postgres SQLSTATE 23505 = unique_violation. neon-http surfaces the code
    // on the error object; the constraint name shows up either in `.message`
    // or in `.cause.message`. Cover all three to avoid the regex-vs-format
    // brittleness that surfaced on prod (the message-only match leaked the
    // 23505 to 500 here, found by negativa-6 E2E on 2026-05-11).
    const code = (e as { code?: string } | null)?.code;
    const msg = String((e as { message?: string } | null)?.message ?? '');
    const causeMsg = String(
      ((e as { cause?: { message?: string } } | null)?.cause?.message) ?? '',
    );
    if (
      code === '23505' ||
      /event_types_owner_slug_unique/.test(msg) ||
      /event_types_owner_slug_unique/.test(causeMsg)
    ) {
      return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    }
    console.error('[POST /api/booking/event-types]', e);
    return NextResponse.json(
      { error: 'Failed to create event type' },
      { status: 500 },
    );
  }
}
