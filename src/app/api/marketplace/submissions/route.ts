import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { db } from '@/lib/db';
import { marketplaceSubmissions } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

const PHASES = new Set(['idea', 'practice']);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const email = body.email ? String(body.email).trim() : null;
  const phase = String(body.phase ?? '').trim();
  const title = String(body.title ?? '').trim();
  const pitch = String(body.pitch ?? '').trim();
  const links = body.links ? String(body.links).trim() : null;
  const targetSessionDate = body.targetSessionDate
    ? String(body.targetSessionDate).slice(0, 10)
    : null;
  const problem = body.problem ? String(body.problem).trim() : null;
  const audience = body.audience ? String(body.audience).trim() : null;
  const angle = body.angle ? String(body.angle).trim() : null;
  const takeaway = body.takeaway ? String(body.takeaway).trim() : null;
  const mvp = body.mvp ? String(body.mvp).trim() : null;
  const sharpenedPitch = body.sharpenedPitch ? String(body.sharpenedPitch).trim() : null;
  const materialsUrl = body.materialsUrl ? String(body.materialsUrl).trim() : null;
  const materialFiles = Array.isArray(body.materialFiles) ? body.materialFiles : null;
  const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;

  const session = await auth().catch(() => null);
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to submit an offer.' }, { status: 401 });
  }
  const submitterUserId =
    (session.user as { hyloId?: string; id?: string; email?: string }).hyloId ??
    (session.user as { id?: string }).id ??
    (session.user as { email?: string }).email ??
    null;

  if (!name || !title || !pitch || !PHASES.has(phase)) {
    return NextResponse.json(
      { error: 'Missing required fields (name, phase, title, pitch).' },
      { status: 400 },
    );
  }
  if (name.length > 200 || title.length > 200 || pitch.length > 4000) {
    return NextResponse.json({ error: 'Field too long.' }, { status: 400 });
  }

  const [row] = await db
    .insert(marketplaceSubmissions)
    .values({
      name,
      email,
      phase,
      title,
      pitch,
      problem,
      audience,
      angle,
      takeaway,
      mvp,
      sharpenedPitch,
      materialsUrl,
      materialFiles,
      imageUrl,
      links,
      targetSessionDate,
      submitterUserId,
    })
    .returning();

  return NextResponse.json({ success: true, id: row.id }, { status: 201 });
}

export async function GET() {
  const session = await auth().catch(() => null);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rows = await db
    .select()
    .from(marketplaceSubmissions)
    .orderBy(desc(marketplaceSubmissions.createdAt));
  return NextResponse.json({ submissions: rows });
}
