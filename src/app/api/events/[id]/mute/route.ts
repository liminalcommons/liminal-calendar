import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { muteSeries, unmuteSeries } from '@/lib/notifications/mute-repo';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseEventId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_request: Request, ctx: Ctx) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ error: 'No member record' }, { status: 400 });
  const { id } = await ctx.params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  await muteSeries(db, authed.memberId, eventId);
  revalidatePath('/preferences/notifications');
  return NextResponse.json({ muted: true, eventId });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const authed = await getAuthedUser();
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (authed.memberId == null) return NextResponse.json({ error: 'No member record' }, { status: 400 });
  const { id } = await ctx.params;
  const eventId = parseEventId(id);
  if (eventId == null) return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  await unmuteSeries(db, authed.memberId, eventId);
  revalidatePath('/preferences/notifications');
  return NextResponse.json({ muted: false, eventId });
}
