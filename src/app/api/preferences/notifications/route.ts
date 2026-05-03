import { NextResponse } from 'next/server';
import { auth } from '@/../auth';
import { db } from '@/lib/db';
import { ensurePreferences, updatePreferences, type PreferencesUpdate } from '@/lib/notifications/preferences';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userIdFromSession(session: any): string {
  return session.user.hyloId || session.user.id;
}

const ALLOWED_KEYS = [
  'pushOneHour', 'pushFifteenMin', 'pushAtStart',
  'emailTwentyFourHour', 'emailOneHour', 'emailFifteenMin',
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const prefs = await ensurePreferences(db, userIdFromSession(session));
  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const update: PreferencesUpdate = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key];
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `${key} must be boolean` }, { status: 400 });
      }
      (update as Record<string, boolean>)[key] = value;
    }
  }
  await updatePreferences(db, userIdFromSession(session), update);
  return NextResponse.json({ ok: true });
}
