import { NextResponse } from 'next/server';
import postgres from 'postgres';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const neonUrl = process.env.calender_POSTGRES_URL_NON_POOLING || process.env.calender_POSTGRES_URL;
  const supaUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!neonUrl) return NextResponse.json({ error: 'No Neon URL' }, { status: 500 });
  if (!supaUrl) return NextResponse.json({ error: 'No Supabase URL' }, { status: 500 });

  const neon = postgres(neonUrl, { ssl: 'require', max: 1, connect_timeout: 15, prepare: false });
  const supa = postgres(supaUrl, { ssl: 'require', max: 1, connect_timeout: 15, prepare: false });

  const report: Record<string, { read: number; written: number; error?: string }> = {};

  try {
    for (const table of TABLES) {
      try {
        const exists = await supa`SELECT to_regclass(${'public.' + table}) AS reg`;
        if (!exists[0]?.reg) {
          report[table] = { read: 0, written: 0, error: 'Target table missing' };
          continue;
        }
        const rows = (await neon.unsafe(`SELECT * FROM ${table}`)) as Record<string, unknown>[];
        let written = 0;
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const colList = cols.map((c) => `"${c}"`).join(',');
          for (const row of rows) {
            const values = cols.map((c) => row[c]);
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
            try {
              const res = await supa.unsafe(
                `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                values as never[],
              );
              const count = (res as unknown as { count?: number }).count ?? 1;
              written += count;
            } catch (rowErr) {
              report[table] = {
                read: rows.length,
                written,
                error: `Row insert failed: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`,
              };
              break;
            }
          }
        }
        if (!report[table]) report[table] = { read: rows.length, written };
      } catch (tableErr) {
        report[table] = {
          read: 0,
          written: 0,
          error: tableErr instanceof Error ? tableErr.message : String(tableErr),
        };
      }
    }

    // Reset SERIAL sequences so future inserts don't collide with copied PKs.
    for (const table of TABLES) {
      try {
        await supa.unsafe(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`,
          [table],
        );
      } catch {
        // Table missing or no id column — non-fatal.
      }
    }

    return NextResponse.json({ ok: true, report });
  } finally {
    await neon.end({ timeout: 5 });
    await supa.end({ timeout: 5 });
  }
}
