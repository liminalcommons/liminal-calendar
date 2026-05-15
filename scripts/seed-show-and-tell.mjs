// Seed a biweekly recurring Show & Tell event (idempotent).
// Run: node scripts/seed-show-and-tell.mjs
//
// Defaults: next Wednesday at 18:00 Europe/Berlin, fortnightly.
// Adjust the constants below if you want a different starting day/time.
//
// Idempotency: if an event titled "Show & Tell" already exists in the future,
// the script does nothing and exits cleanly.

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
  process.env.calender_DATABASE_URL_UNPOOLED ||
  process.env.calender_DATABASE_URL ||
  process.env.DATABASE_URL;
if (!url) {
  console.error('No DB url in env. Need calender_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}
const sql = neon(url);

const TITLE = 'Show & Tell';
const LOCATION = 'Castalia';
const DURATION_MINUTES = 60;
const TIMEZONE = 'Europe/Berlin';
// Local time in TIMEZONE for the first instance:
const TARGET_HOUR_LOCAL = 18; // 6pm
const TARGET_MINUTE_LOCAL = 0;
const TARGET_DOW = 3; // 0=Sun .. 3=Wed

function nextTargetDate() {
  // Start from "now in TIMEZONE", find the next Wed at 18:00 local time.
  // Approach: build a Date for today 18:00 in TIMEZONE, advance day-by-day
  // until DOW matches and the resulting instant is in the future.
  const now = new Date();
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(now);
    probe.setUTCDate(probe.getUTCDate() + offset);
    // Re-interpret the date at TARGET_HOUR_LOCAL local in TIMEZONE.
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).formatToParts(probe);
    const get = (t) => local.find((p) => p.type === t)?.value;
    const dowStr = get('weekday');
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    if (dowMap[dowStr] !== TARGET_DOW) continue;
    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));
    // Construct an ISO-ish string and ask the JS engine to interpret
    // it as local-to-TIMEZONE. Trick: compute the UTC offset for that
    // wallclock by formatting back and diffing.
    const isoLocal = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(TARGET_HOUR_LOCAL).padStart(2, '0')}:${String(TARGET_MINUTE_LOCAL).padStart(2, '0')}:00`;
    const asUtc = new Date(`${isoLocal}Z`);
    const tzString = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(asUtc);
    const offsetPart = tzString.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
    const m2 = offsetPart.match(/GMT([+-]\d+)(?::(\d+))?/);
    const offHours = m2 ? Number(m2[1]) : 0;
    const offMins = m2 && m2[2] ? Number(m2[2]) : 0;
    const startsAt = new Date(asUtc.getTime() - (offHours * 60 + offMins) * 60 * 1000);
    if (startsAt.getTime() > now.getTime()) return startsAt;
  }
  throw new Error('Could not find next target date within 14 days');
}

const startsAt = nextTargetDate();
const endsAt = new Date(startsAt.getTime() + DURATION_MINUTES * 60 * 1000);

console.log(`Will seed: ${TITLE}`);
console.log(`  startsAt = ${startsAt.toISOString()}`);
console.log(`  endsAt   = ${endsAt.toISOString()}`);
console.log(`  ${startsAt.toLocaleString('en-US', { timeZone: TIMEZONE, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`);

const existing =
  await sql`SELECT id, starts_at FROM events WHERE title = ${TITLE} AND starts_at >= NOW() ORDER BY starts_at ASC LIMIT 1`;
if (existing.length > 0) {
  console.log(`\nAlready exists (id=${existing[0].id} at ${existing[0].starts_at}). Skipping.`);
  process.exit(0);
}

const description =
  'Biweekly community meeting — submitted ideas get presented in 40 minutes. ' +
  'Submit yours at /show-and-tell/submit/quick.';

const result =
  await sql`INSERT INTO events
    (title, description, starts_at, ends_at, timezone, location, recurrence_rule, creator_id, creator_name, visibility)
    VALUES
    (${TITLE}, ${description}, ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${TIMEZONE}, ${LOCATION}, 'fortnightly', 'system:show-and-tell-seed', 'Show & Tell', 'public')
    RETURNING id`;

console.log(`\nSeeded event id=${result[0].id}.`);
