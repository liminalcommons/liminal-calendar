import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conferences } from '@/lib/db/schema';

/**
 * Public conference directory. No auth: names, slugs, dates and statuses are
 * public facts the nav and conference pages need before sign-in.
 * GET /api/conferences → all, oldest first.
 * GET /api/conferences?slug=limicon1 → that one (404 if unknown).
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug');
  try {
    const rows = await db.select().from(conferences).orderBy(asc(conferences.id));
    const slim = rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      status: c.status,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
    }));
    if (slug) {
      const one = slim.find((c) => c.slug === slug);
      if (!one) return NextResponse.json({ error: 'Unknown conference' }, { status: 404 });
      return NextResponse.json(one);
    }
    return NextResponse.json(slim);
  } catch (err) {
    console.error('[GET /api/conferences]', err);
    return NextResponse.json({ error: 'Failed to fetch conferences' }, { status: 500 });
  }
}
