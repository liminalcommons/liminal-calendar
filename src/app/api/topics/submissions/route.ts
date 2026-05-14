import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { topicSubmissions } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const user = await getAuthedUser();

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

  // Guest submissions: require email + name. Authenticated users use session identity.
  let submitterId: string;
  let submitterName: string;
  let submitterEmail: string | null;
  let memberId: number | null;

  if (user) {
    submitterId = user.id;
    submitterName = user.name || 'Anonymous';
    submitterEmail = user.email ?? null;
    memberId = user.memberId ?? null;
  } else {
    const emailRaw = typeof body.submitterEmail === 'string' ? body.submitterEmail.trim() : '';
    const nameRaw = typeof body.submitterName === 'string' ? body.submitterName.trim() : '';
    if (!EMAIL_RE.test(emailRaw)) {
      return NextResponse.json(
        { error: 'A valid email is required for guest submissions.' },
        { status: 400 },
      );
    }
    if (!nameRaw) {
      return NextResponse.json(
        { error: 'Your name is required.' },
        { status: 400 },
      );
    }
    submitterId = `guest:${randomUUID()}`;
    submitterName = nameRaw;
    submitterEmail = emailRaw;
    memberId = null;
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
      submitterId,
      memberId,
      submitterName,
      submitterEmail,
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
