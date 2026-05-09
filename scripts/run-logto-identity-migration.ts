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
loadEnv('.env.production.local');
loadEnv('.env.local');

const url =
  process.env.calender_DATABASE_URL_UNPOOLED ||
  process.env.calender_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!url) throw new Error('No DATABASE_URL found');

const sql = neon(url);

function stripComments(s: string): string {
  return s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
}

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

async function main() {
  const path = 'src/lib/db/migrations/logto-identity.sql';
  const schemaSQL = stripComments(readFileSync(path, 'utf8'));

  console.log('[1/2] Applying logto-identity migration...');
  for (const stmt of splitStatements(schemaSQL)) {
    await sql.query(stmt);
  }
  console.log('     ✓ logto_id column + unique + index + 3-way CHECK');

  console.log('\n[2/2] Verifying...');
  const cols = (await sql.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'members' AND column_name IN ('hylo_id','clerk_id','logto_id')
    ORDER BY column_name
  `)) as Array<{ column_name: string; data_type: string; is_nullable: string }>;
  console.log('     identity columns:', cols);

  const checks = (await sql.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'members'::regclass AND conname = 'chk_members_identity'
  `)) as Array<{ conname: string; def: string }>;
  console.log('     identity check :', checks);

  const counts = (await sql.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE hylo_id IS NOT NULL)::int AS with_hylo,
      COUNT(*) FILTER (WHERE clerk_id IS NOT NULL)::int AS with_clerk,
      COUNT(*) FILTER (WHERE logto_id IS NOT NULL)::int AS with_logto
    FROM members
  `)) as Array<{ total: number; with_hylo: number; with_clerk: number; with_logto: number }>;
  console.log('     member counts  :', counts[0]);

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
