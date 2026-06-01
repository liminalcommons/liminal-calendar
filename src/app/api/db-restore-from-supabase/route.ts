import { NextResponse } from 'next/server';
import postgres from 'postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// FK-safe order: parents before children. members → events → everything that
// references them. Mirrors db-restore-from-neon but copies FROM Supabase
// (POSTGRES_URL) INTO the Hetzner VPS (DATABASE_URL). ON CONFLICT DO NOTHING
// makes this a pure union backfill — rows already on the VPS are skipped, only
// Supabase-only rows insert. One-shot reconciliation after the VPS cutover.
const TABLES = [
  'members',
  'events',
  'rsvps',
  'newsletter_subscribers',
  'event_comments',
  'attendance_reports',
  'notifications',
  'notification_log',
  'notification_preferences',
  'push_subscriptions',
  'event_mutes',
  'event_invitations',
  'event_types',
  'bookable_windows',
  'topic_submissions',
];

export async function POST(request: Request) {
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 500 });
  }
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Source = Supabase. POSTGRES_URL still holds the original Supabase value
  // (POSTGRES_URL_NON_POOLING was repointed to the VPS at cutover, so read
  // POSTGRES_URL explicitly here). Dest = VPS via DATABASE_URL.
  const supaUrl = process.env.POSTGRES_URL;
  const vpsUrl = process.env.DATABASE_URL;
  if (!supaUrl) return NextResponse.json({ error: 'No Supabase URL (POSTGRES_URL)' }, { status: 500 });
  if (!vpsUrl) return NextResponse.json({ error: 'No VPS URL (DATABASE_URL)' }, { status: 500 });

  const supa = postgres(supaUrl, { ssl: 'require', max: 1, connect_timeout: 15, prepare: false });
  const vps = postgres(vpsUrl, { ssl: 'require', max: 1, connect_timeout: 15, prepare: false });

  const report: Record<string, { read: number; inserted: number; error?: string }> = {};

  try {
    for (const table of TABLES) {
      try {
        const rows = (await supa.unsafe(`SELECT * FROM ${table}`)) as Record<string, unknown>[];
        let inserted = 0;
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const colList = cols.map((c) => `"${c}"`).join(',');
          for (const row of rows) {
            const values = cols.map((c) => row[c]);
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
            try {
              const res = await vps.unsafe(
                `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                values as never[],
              );
              const count = (res as unknown as { count?: number }).count ?? 0;
              inserted += count;
            } catch (rowErr) {
              report[table] = {
                read: rows.length,
                inserted,
                error: `Row insert failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`,
              };
              break;
            }
          }
        }
        if (!report[table]) report[table] = { read: rows.length, inserted };
      } catch (tableErr) {
        report[table] = {
          read: 0,
          inserted: 0,
          error: tableErr instanceof Error ? tableErr.message : String(tableErr),
        };
      }
    }

    // Reset SERIAL sequences on the VPS so future inserts don't collide with
    // any higher PKs just backfilled from Supabase.
    for (const table of TABLES) {
      try {
        await vps.unsafe(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 1), 1), true)`,
          [table],
        );
      } catch {
        // Table missing or no id column — non-fatal.
      }
    }

    return NextResponse.json({ ok: true, report });
  } finally {
    await supa.end({ timeout: 5 });
    await vps.end({ timeout: 5 });
  }
}
