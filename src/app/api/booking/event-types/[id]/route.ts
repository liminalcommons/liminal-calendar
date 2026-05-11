/**
 * GET    /api/booking/event-types/[id] — fetch one (own only)
 * PATCH  /api/booking/event-types/[id] — partial update (own only)
 * DELETE /api/booking/event-types/[id] — soft-delete via active=false
 *
 * Task 2 of Plan 3 (1:1 Booking).
 *
 * Auth: getCurrentMember(db). Authorization: row.ownerMemberId ===
 * member.id; on mismatch return 404 (do not disclose existence).
 *
 * Soft-delete preserves historical events FK references.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventTypes } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { EventTypeInput } from '@/lib/booking/event-types-repo';

async function loadById(id: number) {
  const [row] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, id))
    .limit(1);
  return row ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await loadById(id);
  if (!row || row.ownerMemberId !== member.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await loadById(id);
  if (!row || row.ownerMemberId !== member.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = EventTypeInput.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const [updated] = await db
      .update(eventTypes)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(eventTypes.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (e: unknown) {
    // Mirror the POST handler: PG SQLSTATE 23505 takes priority; constraint
    // name may live in `.message` or `.cause.message` depending on driver.
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
    console.error('[PATCH /api/booking/event-types/[id]]', e);
    return NextResponse.json(
      { error: 'Failed to update event type' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await loadById(id);
  if (!row || row.ownerMemberId !== member.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db
    .update(eventTypes)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(eventTypes.id, id))
    .returning();
  return new NextResponse(null, { status: 204 });
}
