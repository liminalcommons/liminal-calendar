import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Preview-only test sign-in. Mints a real Auth.js session cookie for a
 * named test member so the Limicon preview can be exercised end-to-end
 * before the production identity providers trust the preview origin.
 *
 * Gates (all must pass):
 *  - never on production (VERCEL_ENV === 'production' → 404 as if missing),
 *  - TEST_LOGIN_CODE must be configured and match the request code,
 *  - AUTH_SECRET must be configured (it signs the cookie).
 *
 * Test members live in the shared members table with a `test:` logtoId
 * prefix so they're trivial to spot and clean up later.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const expectedCode = process.env.TEST_LOGIN_CODE;
  if (!expectedCode) {
    return NextResponse.json({ error: 'Test login is not configured' }, { status: 503 });
  }

  let body: { name?: unknown; code?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; code?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.code !== 'string' || body.code !== expectedCode) {
    return NextResponse.json({ error: 'Wrong code' }, { status: 403 });
  }
  const name = typeof body.name === 'string' && body.name.trim().length > 0
    ? body.name.trim().slice(0, 80)
    : 'Limicon Tester';
  const logtoUserId = `test:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tester'}`;

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Test login is not configured' }, { status: 503 });
  }

  // Find-or-create the test member. Role stays 'member' — governors are
  // promoted explicitly, never minted here.
  const [existing] = await db.select().from(members).where(eq(members.logtoId, logtoUserId)).limit(1);
  const member = existing
    ?? (await db.insert(members).values({ name, logtoId: logtoUserId, role: 'member' }).returning())[0];
  if (!member) {
    return NextResponse.json({ error: 'Could not create test member' }, { status: 500 });
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isHttps = forwardedProto === 'https' || request.nextUrl.protocol === 'https:';
  const cookieName = isHttps ? '__Secure-authjs.session-token' : 'authjs.session-token';

  const token = await encode({
    token: {
      sub: logtoUserId,
      logtoUserId,
      name: member.name,
      email: member.email ?? undefined,
      role: member.role,
    },
    secret,
    salt: cookieName,
    maxAge: 30 * 24 * 60 * 60,
  });

  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  return NextResponse.json({ ok: true, name: member.name });
}
