import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  listNotificationsForUser,
  countUnseen,
} from '@/lib/notifications/inbox/repo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = member.logtoId ?? member.clerkId ?? 'unknown';
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const unseenOnly = url.searchParams.get('unseenOnly') === 'true';

  try {
    const [notifications, unseenCount] = await Promise.all([
      listNotificationsForUser(db, userId, {
        limit: Number.isFinite(limit) ? limit : undefined,
        unseenOnly,
      }),
      countUnseen(db, userId),
    ]);
    return NextResponse.json({ notifications, unseenCount });
  } catch (err) {
    console.error('[GET /api/notifications]', err);
    return NextResponse.json(
      { error: 'Failed to load notifications' },
      { status: 500 },
    );
  }
}
