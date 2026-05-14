// One-off: bump the seeded Show & Tell event from 40 to 60 minutes.
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnv() {
  for (const file of ['.env.production.local', '.env.local']) {
    try {
      const raw = readFileSync(file, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!(k in process.env)) process.env[k] = v.replace(/^['"]|['"]$/g, '').trim();
      }
    } catch {}
  }
}
loadEnv();

const url =
  process.env.calender_DATABASE_URL_UNPOOLED ||
  process.env.calender_DATABASE_URL ||
  process.env.DATABASE_URL;
const sql = neon(url);

const rows = await sql`
  UPDATE events
  SET ends_at = starts_at + INTERVAL '60 minutes',
      updated_at = NOW()
  WHERE title = 'Show & Tell'
    AND starts_at >= NOW()
  RETURNING id, starts_at, ends_at
`;
console.log(`Updated ${rows.length} row(s).`);
for (const r of rows) console.log(`  id=${r.id} starts=${r.starts_at} ends=${r.ends_at}`);
