/**
 * PUT /api/profile/handle — set or change the authenticated member's
 * handle (the URL slug used by `/book/:handle`).
 *
 * Task 1 of Plan 3 (1:1 Booking).
 *
 * Validation:
 *   - lowercased before validation + storage
 *   - regex /^[a-z0-9][a-z0-9-]{2,29}$/  (3-30 chars, must start alphanum)
 *   - reserved-word blacklist (collides with top-level Next.js routes)
 *   - case-insensitive uniqueness check against members.handle, but
 *     idempotent for the caller's own row (no 409 when re-setting own
 *     handle)
 *
 * Responses: 200 ok, 400 invalid, 401 unauth, 409 taken, 500 db error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import { RESERVED_HANDLES } from '@/lib/booking/reserved-handles';

export { RESERVED_HANDLES };

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

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

  const rawHandle =
    body && typeof body === 'object' && 'handle' in body
      ? (body as { handle: unknown }).handle
      : undefined;

  if (typeof rawHandle !== 'string' || rawHandle.length === 0) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  }

  const handle = rawHandle.toLowerCase().trim();

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      {
        error:
          'handle must be 3-30 chars, lowercase alphanumeric and hyphens, starting with a letter or digit',
      },
      { status: 400 },
    );
  }

  if (RESERVED_HANDLES.has(handle)) {
    return NextResponse.json({ error: 'handle is reserved' }, { status: 400 });
  }

  try {
    // Case-insensitive uniqueness check. Idempotent: if the row that
    // owns this handle is the caller, fall through to the update (a
    // no-op write that still returns the row).
    const [taken] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(sql`lower(${members.handle})`, handle))
      .limit(1);
    if (taken && taken.id !== member.id) {
      return NextResponse.json({ error: 'handle is taken' }, { status: 409 });
    }

    const [updated] = await db
      .update(members)
      .set({ handle })
      .where(eq(members.id, member.id))
      .returning();

    return NextResponse.json({ handle: updated?.handle ?? handle });
  } catch (err) {
    console.error('[PUT /api/profile/handle]', err);
    return NextResponse.json({ error: 'Failed to update handle' }, { status: 500 });
  }
}
