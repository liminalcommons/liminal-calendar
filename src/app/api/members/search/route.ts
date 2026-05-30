import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { members } from '@/lib/db/schema';
import { ilike, or, and, not, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  const authed = await getAuthedUser();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const limitRaw = url.searchParams.get('limit');

  // Validate q: 2..50 chars
  if (q.length < 2 || q.length > 50) {
    return NextResponse.json({ error: 'Bad request: q must be 2–50 characters' }, { status: 400 });
  }

  // Validate limit: 1..25, default 10
  let limit = 10;
  if (limitRaw !== null) {
    const parsed = parseInt(limitRaw, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 25) {
      return NextResponse.json({ error: 'Bad request: limit must be 1–25' }, { status: 400 });
    }
    limit = parsed;
  }

  const currentUserId = authed.id ?? null;

  try {
    const likeQ = `%${q}%`;

    // Match on name + handle ONLY — never email. Matching on email turns this
    // endpoint into a membership oracle ("is this address registered?") and lets
    // any signed-in user enumerate the directory by email.
    const matchFilter = or(
      ilike(members.name, likeQ),
      ilike(members.handle, likeQ),
    );

    // Exclude requesting user: skip rows where logtoId or clerkId equals currentUserId
    const excludeFilter =
      currentUserId !== null
        ? not(
            or(
              eq(members.logtoId, currentUserId),
              eq(members.clerkId, currentUserId),
            )!,
          )
        : undefined;

    const whereClause = excludeFilter ? and(matchFilter, excludeFilter) : matchFilter;

    const rows = await db
      .select({
        logtoId: members.logtoId,
        clerkId: members.clerkId,
        name: members.name,
        handle: members.handle,
        image: members.image,
      })
      .from(members)
      .where(whereClause)
      .limit(limit);

    const result = rows.map((r) => ({
      userId: r.logtoId ?? r.clerkId ?? '',
      name: r.name,
      handle: r.handle,
      image: r.image,
    }));

    return NextResponse.json({ members: result });
  } catch (err) {
    console.error('[GET /api/members/search]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
