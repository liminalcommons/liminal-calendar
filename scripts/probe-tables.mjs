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
        if (!(k in process.env)) {
          process.env[k] = v.replace(/^['"]|['"]$/g, '').trim();
        }
      }
    } catch {}
  }
}
loadEnv();
const url = process.env.calender_DATABASE_URL_UNPOOLED || process.env.calender_DATABASE_URL || process.env.DATABASE_URL;
const sql = neon(url);

const rows = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log('Tables in prod DB:');
for (const r of rows) console.log('  ' + r.tablename);
