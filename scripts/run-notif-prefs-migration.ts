import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Lightweight .env.local parser — avoids dotenv dependency.
function loadEnv(path: string) {
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    console.warn(`Could not load ${path}:`, (e as Error).message);
  }
}
loadEnv('.env.local');

const url = process.env.calender_DATABASE_URL_UNPOOLED || process.env.calender_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('No DATABASE_URL found');

const sql = neon(url);

const schemaPath = 'src/lib/db/migrations/notification-preferences.sql';
const backfillPath = 'src/lib/db/migrations/notification-preferences-backfill.sql';

function stripComments(s: string): string {
  return s
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .trim();
}

async function main() {
  const schemaSQL = stripComments(readFileSync(schemaPath, 'utf8'));
  const backfillSQL = stripComments(readFileSync(backfillPath, 'utf8'));

  console.log('[1/4] Running schema migration...');
  await sql.query(schemaSQL);
  console.log('     ✓ notification_preferences table ensured');

  console.log('[2/4] Counting existing rsvps users...');
  const before = await sql`SELECT COUNT(DISTINCT user_id)::int AS n FROM rsvps`;
  console.log(`     ${before[0].n} distinct users in rsvps`);

  console.log('[3/4] Running backfill...');
  await sql.query(backfillSQL);
  console.log('     ✓ backfill complete (idempotent)');

  console.log('[4/4] Counting notification_preferences rows...');
  const after = await sql`SELECT COUNT(*)::int AS n FROM notification_preferences`;
  console.log(`     ${after[0].n} rows in notification_preferences`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
