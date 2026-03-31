import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getUserRole } from '@/lib/auth-helpers';
import { getEvents, LIMINAL_COMMONS_GROUP_ID } from '@/lib/hylo-client';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST() {
  // Admin only
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = getUserRole(session);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any).accessToken as string | undefined;
  if (!token) {
    return NextResponse.json({ error: 'No Hylo token in session' }, { status: 401 });
  }

  try {
    const hyloEvents = await getEvents(token, LIMINAL_COMMONS_GROUP_ID);
    let imported = 0;
    let skipped = 0;

    for (const he of hyloEvents) {
      // Skip if already imported (check by hylo_post_id)
      const existing = await db.select({ id: events.id })
        .from(events)
        .where(eq(events.hyloPostId, he.id))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const startsAt = new Date(he.startTime);
      const endsAt = he.endTime ? new Date(he.endTime) : new Date(startsAt.getTime() + 3600000);

      await db.insert(events).values({
        title: he.title,
        description: he.details || null,
        startsAt,
        endsAt,
        timezone: he.timezone || 'UTC',
        location: he.location || null,
        creatorId: he.creator.id,
        creatorName: he.creator.name,
        creatorImage: he.creator.avatarUrl || null,
        hyloGroupId: LIMINAL_COMMONS_GROUP_ID,
        hyloPostId: he.id,
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      total: hyloEvents.length,
      imported,
      skipped,
    });
  } catch (err) {
    console.error('[POST /api/import-hylo]', err);
    return NextResponse.json({
      error: 'Import failed',
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
