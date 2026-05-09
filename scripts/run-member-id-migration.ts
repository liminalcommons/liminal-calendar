import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

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

const url =
  process.env.calender_DATABASE_URL_UNPOOLED ||
  process.env.calender_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!url) throw new Error('No DATABASE_URL found');

const sql = neon(url);

const schemaPath = 'src/lib/db/migrations/member-id-canonicalization.sql';
const backfillPath = 'src/lib/db/migrations/member-id-canonicalization-backfill.sql';

function stripComments(s: string): string {
  return s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .trim();
}

// Naive splitter that respects $$-delimited blocks (used by DO $$ ... $$).
// Splits on top-level ';' that lie outside any $$ pair.
function splitStatements(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '$' && s[i + 1] === '$') {
      inDollar = !inDollar;
      buf += '$$';
      i += 1;
      continue;
    }
    if (ch === ';' && !inDollar) {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt + ';');
      buf = '';
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail.endsWith(';') ? tail : tail + ';');
  return out;
}

const REPORT_TABLES: Array<{ table: string; col: string }> = [
  { table: 'events', col: 'member_id' },
  { table: 'rsvps', col: 'member_id' },
  { table: 'event_comments', col: 'member_id' },
  { table: 'attendance_reports', col: 'member_id' },
  { table: 'event_invitations', col: 'member_id' },
  { table: 'notifications', col: 'member_id' },
  { table: 'notifications', col: 'actor_member_id' },
  { table: 'notification_preferences', col: 'member_id' },
  { table: 'notification_log', col: 'member_id' },
  { table: 'event_types', col: 'owner_member_id' },
  { table: 'bookable_windows', col: 'owner_member_id' },
  { table: 'image_generations', col: 'member_id' },
];

async function reportCoverage(label: string) {
  console.log(`\n=== ${label} ===`);
  for (const { table, col } of REPORT_TABLES) {
    try {
      const total = (await sql.query(`SELECT COUNT(*)::int AS n FROM ${table}`)) as Array<{ n: number }>;
      const filled = (await sql.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} IS NOT NULL`,
      )) as Array<{ n: number }>;
      const t = total[0].n;
      const f = filled[0].n;
      const gap = t - f;
      const pct = t === 0 ? '—' : `${((f / t) * 100).toFixed(1)}%`;
      console.log(`  ${table.padEnd(28)} ${col.padEnd(20)} ${f}/${t} (${pct}) gap=${gap}`);
    } catch (e) {
      console.log(`  ${table.padEnd(28)} ${col.padEnd(20)} ERROR: ${(e as Error).message}`);
    }
  }
}

async function main() {
  const schemaSQL = stripComments(readFileSync(schemaPath, 'utf8'));
  const backfillSQL = stripComments(readFileSync(backfillPath, 'utf8'));

  console.log('[1/4] Applying additive schema (ADD COLUMN + indexes)...');
  for (const stmt of splitStatements(schemaSQL)) {
    await sql.query(stmt);
  }
  console.log('     ✓ member_id columns + indexes ensured');

  await reportCoverage('Coverage BEFORE backfill');

  console.log('\n[2/4] Running backfill (provider-string → members.id)...');
  for (const stmt of splitStatements(backfillSQL)) {
    await sql.query(stmt);
  }
  console.log('     ✓ backfill complete (idempotent)');

  await reportCoverage('Coverage AFTER backfill');

  console.log('\n[3/4] Sanity checks — orphan rows (creator with no member match):');
  for (const { table, col } of REPORT_TABLES) {
    try {
      const r = (await sql.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${col} IS NULL`,
      )) as Array<{ n: number }>;
      if (r[0].n > 0) {
        console.log(`     ⚠ ${table}.${col}: ${r[0].n} unmatched rows (no members row for their string id)`);
      }
    } catch {
      /* table absent — skip */
    }
  }

  console.log('\n[4/4] Distinct unmatched provider-strings (top 10 per table):');
  const tablesToShow: Array<{ table: string; col: string }> = [
    { table: 'events', col: 'creator_id' },
    { table: 'rsvps', col: 'user_id' },
    { table: 'event_comments', col: 'author_id' },
  ];
  for (const { table, col } of tablesToShow) {
    const rows = (await sql.query(
      `SELECT ${col} AS id, COUNT(*)::int AS n FROM ${table} WHERE member_id IS NULL GROUP BY ${col} ORDER BY n DESC LIMIT 10`,
    )) as Array<{ id: string; n: number }>;
    if (rows.length === 0) {
      console.log(`     ${table}.${col}: ✓ no unmatched ids`);
    } else {
      console.log(`     ${table}.${col} unmatched:`);
      for (const r of rows) console.log(`       ${r.id} × ${r.n}`);
    }
  }

  console.log('\nDone. Phase 1 (additive) is now applied. No code paths read member_id yet.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
