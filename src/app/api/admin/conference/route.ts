import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { isAdminLike } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { conferences, events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getConferenceBySlug, listConferences } from '@/lib/events/conferences';
import { dbEventToDisplayEvent } from '@/lib/db/to-display-event';

async function requireAdminLike() {
  const user = await getAuthedUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdminLike(user.role))
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user };
}

const STATUSES = new Set(['upcoming', 'active', 'ended']);

/**
 * GET /api/admin/conference → every conference (oldest first).
 * GET /api/admin/conference?slug=limicon1 → that conference.
 * GET /api/admin/conference?slug=limicon1&flagged=1 → plus the
 * "continues beyond" events still linked to it (the retention worklist).
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdminLike();
  if (gate.error) return gate.error;

  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) {
    return NextResponse.json(await listConferences());
  }

  const conference = await getConferenceBySlug(slug);
  if (!conference) {
    return NextResponse.json({ error: 'Unknown conference' }, { status: 404 });
  }

  if (new URL(request.url).searchParams.get('flagged') === '1') {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.conferenceId, conference.id), eq(events.continueBeyond, true)));
    return NextResponse.json({
      conference,
      flagged: rows.map((e) => dbEventToDisplayEvent(e)),
    });
  }

  return NextResponse.json({ conference });
}

/**
 * POST /api/admin/conference { slug, status?, startsAt?, endsAt? }.
 * Dates may be ISO strings or null (clear). Ending a conference removes its
 * still-linked events from every query; retained events (conference_id cleared
 * via PATCH /api/events/[id]) are unaffected.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdminLike();
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const setValues: Record<string, unknown> = { };
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: 'status must be upcoming, active, or ended' },
        { status: 400 },
      );
    }
    setValues.status = body.status;
  }
  for (const key of ['startsAt', 'endsAt'] as const) {
    if (body[key] !== undefined) {
      if (body[key] !== null && typeof body[key] === 'string') {
        const d = new Date(body[key] as string);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
        }
        setValues[key === 'startsAt' ? 'startsAt' : 'endsAt'] = d;
      } else if (body[key] === null) {
        setValues[key === 'startsAt' ? 'startsAt' : 'endsAt'] = null;
      } else {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
    }
  }
  if (Object.keys(setValues).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const [updated] = await db
    .update(conferences)
    .set(setValues)
    .where(eq(conferences.slug, slug))
    .returning();
  if (!updated) {
    return NextResponse.json({ error: 'Unknown conference' }, { status: 404 });
  }

  revalidatePath('/admin');
  revalidatePath(`/c/${slug}`);
  return NextResponse.json(updated);
}
