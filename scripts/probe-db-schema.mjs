// Read-only probe: inspects the prod members table indexes + constraints.
// Tests the exact INSERT shape syncClerkMember uses (rolled back via savepoint
// — does NOT mutate the table).
//
// Reads DATABASE_URL from .env.production.local (run `vercel env pull
// .env.production.local --environment=production` first).

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

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.calender_DATABASE_URL ||
  process.env.calender_POSTGRES_URL;

if (!url) {
  console.error('No DATABASE_URL / POSTGRES_URL found');
  process.exit(1);
}

const sql = neon(url);

console.log('=== members.indexes ===');
const indexes = await sql`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'members'
  ORDER BY indexname
`;
for (const i of indexes) {
  console.log(`  ${i.indexname}`);
  console.log(`    ${i.indexdef}`);
}

console.log('\n=== members.constraints ===');
const constraints = await sql`
  SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class cl ON con.conrelid = cl.oid
  WHERE cl.relname = 'members'
  ORDER BY con.conname
`;
for (const c of constraints) {
  console.log(`  ${c.conname} [${c.contype}] : ${c.def}`);
}

console.log('\n=== members row counts ===');
const counts = await sql`
  SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE hylo_id IS NOT NULL) AS with_hylo_id,
    COUNT(*) FILTER (WHERE clerk_id IS NOT NULL) AS with_clerk_id,
    COUNT(*) FILTER (WHERE hylo_id IS NULL) AS without_hylo_id,
    COUNT(*) FILTER (WHERE clerk_id IS NULL) AS without_clerk_id
  FROM members
`;
console.log(counts[0]);

console.log('\n=== rows with clerk_id (current 3) ===');
const clerks = await sql`
  SELECT id, hylo_id, clerk_id, email, role, created_at, updated_at
  FROM members
  WHERE clerk_id IS NOT NULL
  ORDER BY id
`;
for (const r of clerks) console.log(' ', r);

console.log('\n=== dry-run INSERT test (rolled back) ===');
console.log('Simulating syncClerkMember.insert for a fresh Clerk-only row...');
try {
  // Wrap in transaction + rollback so we never persist test data.
  // Neon serverless does not support multi-statement BEGIN/ROLLBACK
  // through `sql` template tag. Use sql.transaction instead.
  await sql.transaction(async (tx) => {
    const insertResult = await tx`
      INSERT INTO members (clerk_id, name, email, image, role, feed_token)
      VALUES ('test_probe_only_will_rollback', 'Probe', 'probe@example.invalid', NULL, 'member', 'feed_probe_rollback')
      ON CONFLICT (clerk_id) DO UPDATE
      SET name = 'Probe', updated_at = NOW()
      RETURNING id, clerk_id, hylo_id
    `;
    console.log('  INSERT succeeded:', insertResult);
    // Force rollback by throwing.
    throw new Error('__INTENTIONAL_ROLLBACK__');
  });
} catch (err) {
  if (err.message === '__INTENTIONAL_ROLLBACK__') {
    console.log('  Rolled back as intended. INSERT path WORKS.');
  } else {
    console.error('  INSERT path FAILED:');
    console.error('  ', err.message);
    if (err.cause) console.error('  cause:', err.cause);
  }
}

// Clean check that we didn't actually persist
const finalCheck = await sql`SELECT COUNT(*) AS n FROM members WHERE clerk_id LIKE 'test_probe_%'`;
console.log(`\n  Verification: rows with clerk_id LIKE 'test_probe_%' = ${finalCheck[0].n} (must be 0)`);
