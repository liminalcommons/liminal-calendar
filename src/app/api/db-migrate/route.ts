import { NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/migrate';

export async function POST(request: Request) {
  // Protect with CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runMigrations();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/db-migrate]', err);
    return NextResponse.json(
      { error: 'Migration failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
