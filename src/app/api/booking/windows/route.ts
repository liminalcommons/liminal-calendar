/**
 * GET /api/booking/windows — list caller's bookable windows
 * PUT /api/booking/windows — replace caller's full window set
 *
 * Task 3 of Plan 3 (1:1 Booking).
 *
 * Auth: getCurrentMember(db) — Logto-only canonical resolution.
 *
 * Dual-write: writes BOTH ownerMemberId (canonical integer FK) and
 * ownerId (legacy text column). Reads use ownerMemberId.
 *
 * PUT body shape: Array<WindowInput> (max 100). Empty array clears.
 * Returns the new set on success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { type Member } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  WindowInput,
  detectOverlap,
  listMyWindows,
  replaceMyWindows,
} from '@/lib/booking/windows-repo';

function legacyOwnerIdOf(member: Member): string {
  return (
    member.logtoId ??
    member.clerkId ??
    member.hyloId ??
    String(member.id)
  );
}

const WindowsArray = z.array(WindowInput).max(100);

export async function GET() {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await listMyWindows(member.id);
  return NextResponse.json(rows);
}

export async function PUT(request: NextRequest) {
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

  const parsed = WindowsArray.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (detectOverlap(parsed.data)) {
    return NextResponse.json(
      { error: 'Overlapping windows on the same day are not allowed' },
      { status: 400 },
    );
  }

  const legacyOwnerId = legacyOwnerIdOf(member);

  try {
    await replaceMyWindows(member.id, legacyOwnerId, parsed.data);
    const rows = await listMyWindows(member.id);
    return NextResponse.json(rows);
  } catch (e: unknown) {
    console.error('[PUT /api/booking/windows]', e);
    return NextResponse.json(
      { error: 'Failed to replace windows' },
      { status: 500 },
    );
  }
}
