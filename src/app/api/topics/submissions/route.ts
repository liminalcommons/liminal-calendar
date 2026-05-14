import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { topicSubmissions } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export async function POST(request: Request) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to submit a Topic.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!title || !description) {
    return NextResponse.json(
      { error: 'Title and description are required.' },
      { status: 400 },
    );
  }

  const formatHintRaw = typeof body.formatHint === 'string' ? body.formatHint : null;
  const allowedFormats = new Set(['demo', 'insight', 'question', 'other']);
  const formatHint =
    formatHintRaw && allowedFormats.has(formatHintRaw) ? formatHintRaw : null;

  const optString = (k: string): string | null => {
    const v = body[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };

  const [row] = await db
    .insert(topicSubmissions)
    .values({
      submitterId: user.id,
      memberId: user.memberId ?? null,
      submitterName: user.name || 'Anonymous',
      submitterEmail: user.email ?? null,
      title,
      description,
      formatHint,
      materialsUrl: optString('materialsUrl'),
      imageUrl: optString('imageUrl'),
      hook: optString('hook'),
      audience: optString('audience'),
      takeaway: optString('takeaway'),
    })
    .returning();

  return NextResponse.json({ submission: row });
}

export async function GET() {
  const user = await getAuthedUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(topicSubmissions)
    .orderBy(desc(topicSubmissions.createdAt));

  return NextResponse.json({ submissions: rows });
}
