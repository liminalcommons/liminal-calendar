import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { listMutedWithEventDetails } from '@/lib/notifications/muted-with-events';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ muted: [] });
  const muted = await listMutedWithEventDetails(db, authed.memberId);
  return NextResponse.json({ muted });
}
