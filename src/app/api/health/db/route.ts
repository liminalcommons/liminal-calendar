import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Lightweight DB liveness probe. GET returns:
 *   - 200 { status: 'ok' }       — connection works, simple SELECT succeeded
 *   - 503 { status: 'down', error } — DB unreachable or query failed
 *
 * Designed to be pinged by external monitors (UptimeRobot, Better Stack,
 * Pingdom, etc.) every minute. Cheap query (`SELECT 1`) so it doesn't
 * burn compute budget. No DB writes.
 */
export async function GET() {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ok',
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'down',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}

// Don't cache — every probe should hit the actual DB.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
