// One-off diagnostic: list every user in the configured Clerk instance.
// Reads CLERK_SECRET_KEY from env (or .env.local). Prints id, primary email,
// verification status, createdAt, lastSignInAt, total sign-in count.
//
// Usage:
//   node scripts/list-clerk-users.mjs                       # uses .env.local (dev)
//   CLERK_SECRET_KEY=sk_live_... node scripts/list-clerk-users.mjs   # explicit prod
//
// Run from the liminal-calendar package root.

import { readFileSync } from 'node:fs';
import { createClerkClient } from '@clerk/backend';

function loadEnv() {
  if (process.env.CLERK_SECRET_KEY) return; // explicit env wins
  try {
    const raw = readFileSync('.env.local', 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (!(k in process.env)) {
        process.env[k] = v.replace(/^['"]|['"]$/g, '').trim();
      }
    }
  } catch {
    // no .env.local — fall through; SDK will throw if key absent
  }
}

loadEnv();

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error('CLERK_SECRET_KEY not set. Provide it via env or .env.local.');
  process.exit(1);
}

const instance = secretKey.startsWith('sk_live_')
  ? 'PRODUCTION'
  : secretKey.startsWith('sk_test_')
  ? 'DEVELOPMENT'
  : 'unknown';

console.log(`Clerk instance: ${instance} (key prefix ${secretKey.slice(0, 9)}...)`);

const cc = createClerkClient({ secretKey });

const users = [];
let offset = 0;
const limit = 500;
while (true) {
  const page = await cc.users.getUserList({ limit, offset });
  users.push(...page.data);
  if (page.data.length < limit) break;
  offset += limit;
}

console.log(`Total users: ${users.length}\n`);

if (users.length === 0) {
  console.log('  (no users found)');
  process.exit(0);
}

const rows = users.map((u) => {
  const primary =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ??
    u.emailAddresses[0];
  return {
    id: u.id,
    email: primary?.emailAddress ?? '(no email)',
    verified: primary?.verification?.status ?? '(no verification)',
    createdAt: new Date(u.createdAt).toISOString().slice(0, 19) + 'Z',
    lastSignInAt: u.lastSignInAt
      ? new Date(u.lastSignInAt).toISOString().slice(0, 19) + 'Z'
      : '(never)',
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || '(no name)',
  };
});

// Sort by most recent createdAt first.
rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

const colWidths = {
  id: 28,
  email: 36,
  verified: 12,
  createdAt: 21,
  lastSignInAt: 21,
  name: 24,
};
function pad(v, n) {
  return String(v).slice(0, n).padEnd(n);
}
const header =
  pad('id', colWidths.id) +
  pad('email', colWidths.email) +
  pad('verified', colWidths.verified) +
  pad('createdAt', colWidths.createdAt) +
  pad('lastSignInAt', colWidths.lastSignInAt) +
  pad('name', colWidths.name);
console.log(header);
console.log('-'.repeat(header.length));
for (const r of rows) {
  console.log(
    pad(r.id, colWidths.id) +
      pad(r.email, colWidths.email) +
      pad(r.verified, colWidths.verified) +
      pad(r.createdAt, colWidths.createdAt) +
      pad(r.lastSignInAt, colWidths.lastSignInAt) +
      pad(r.name, colWidths.name),
  );
}
