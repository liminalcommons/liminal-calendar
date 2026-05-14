// Apply topic-consent migration to Neon. Idempotent — re-running is safe.
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
if (!url) throw new Error('No DATABASE_URL in env');
const sql = neon(url);

const stmt = readFileSync('src/lib/db/migrations/topic-consent.sql', 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
  .trim();

console.log('Applying topic-consent migration…');
await sql.query(stmt);
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'topic_submissions'
    AND column_name IN ('consent_youtube','consent_telegram','consent_facebook')
  ORDER BY column_name
`;
console.log(`OK — columns present: ${cols.map((c) => c.column_name).join(', ')}`);
