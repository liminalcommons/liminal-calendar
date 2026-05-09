// One-shot migration: every row in `members` with a non-null email gets a
// matching Logto user provisioned via the Castalia Logto Management API.
// On match (find-by-email) we just write members.logto_id. On miss we create
// the Logto user with the member's name and write members.logto_id.
//
// Idempotent: rows that already have logto_id are skipped. Safe to re-run.
//
// Usage:
//   cd packages/liminal-calendar
//   node scripts/migrate-members-to-logto.mjs                # dry-run
//   node scripts/migrate-members-to-logto.mjs --apply        # actually writes
//
// Reads from .env.production.local (Neon) and ../castalia-one/.env.local
// (Logto M2M creds). Run with vercel env already pulled.

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnv() {
  const files = [
    '.env.production.local',
    '.env.local',
    '../castalia-one/.env.local',
  ];
  for (const file of files) {
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
    } catch {
      // missing file is fine
    }
  }
}

loadEnv();
const APPLY = process.argv.includes('--apply');

const DB_URL = process.env.calender_DATABASE_URL || process.env.DATABASE_URL;
const LOGTO_API_BASE = process.env.LOGTO_API_BASE || 'https://id.castalia.one';
const LOGTO_M2M_APP_ID = process.env.LOGTO_M2M_APP_ID;
const LOGTO_M2M_APP_SECRET = process.env.LOGTO_M2M_APP_SECRET;

if (!DB_URL || !LOGTO_M2M_APP_ID || !LOGTO_M2M_APP_SECRET) {
  console.error('Missing env: need calender_DATABASE_URL + LOGTO_M2M_APP_ID + LOGTO_M2M_APP_SECRET');
  process.exit(2);
}

let cachedToken = null;
async function getMgmtToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${LOGTO_M2M_APP_ID}:${LOGTO_M2M_APP_SECRET}`).toString('base64');
  const res = await fetch(`${LOGTO_API_BASE}/oidc/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&resource=https://default.logto.app/api&scope=all',
  });
  if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`);
  const j = await res.json();
  cachedToken = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function logtoFindByEmail(email) {
  const t = await getMgmtToken();
  const url = `${LOGTO_API_BASE}/api/users?search.primaryEmail=${encodeURIComponent(email)}&mode.primaryEmail=exact`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`find ${res.status} ${await res.text()}`);
  const arr = await res.json();
  return arr[0] || null;
}

async function logtoCreate(email, name) {
  const t = await getMgmtToken();
  const res = await fetch(`${LOGTO_API_BASE}/api/users`, {
    method: 'POST',
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: JSON.stringify({ primaryEmail: email, name: name || null }),
  });
  if (res.status === 422) {
    const body = await res.json();
    if (body.code === 'user.email_already_in_use') {
      // Race: another process created it between our find and create. Re-find.
      return logtoFindByEmail(email);
    }
    throw new Error(`create 422 ${JSON.stringify(body)}`);
  }
  if (!res.ok) throw new Error(`create ${res.status} ${await res.text()}`);
  return res.json();
}

const sql = neon(DB_URL);

const rows = await sql`
  SELECT id, hylo_id, clerk_id, logto_id, name, email
  FROM members
  WHERE email IS NOT NULL AND logto_id IS NULL
  ORDER BY id ASC
`;

console.log(`mode=${APPLY ? 'APPLY' : 'DRY-RUN'}  candidates=${rows.length}`);

const stats = { skipped: 0, linked: 0, created: 0, failed: 0 };
for (const m of rows) {
  const tag = `[#${m.id} ${m.email}]`;
  try {
    let user = await logtoFindByEmail(m.email);
    let path;
    if (user) {
      path = 'linked';
    } else {
      if (APPLY) {
        user = await logtoCreate(m.email, m.name);
        path = 'created';
      } else {
        path = 'would-create';
      }
    }
    if (APPLY && user?.id) {
      await sql`UPDATE members SET logto_id = ${user.id}, updated_at = now() WHERE id = ${m.id}`;
    }
    stats[path === 'would-create' ? 'created' : path] = (stats[path === 'would-create' ? 'created' : path] || 0) + 1;
    console.log(`${tag} ${path} -> logtoId=${user?.id ?? '(dry)'} name=${m.name}`);
  } catch (e) {
    stats.failed += 1;
    console.error(`${tag} FAILED:`, e.message);
  }
}

console.log('summary:', stats);
