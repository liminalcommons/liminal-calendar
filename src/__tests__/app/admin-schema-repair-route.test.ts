/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({ getAuthedUser: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: { execute: jest.fn() } }));
jest.mock('@/lib/db/migrate', () => ({ runMigrations: jest.fn() }));

import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { runMigrations } from '@/lib/db/migrate';
import { GET, POST } from '@/app/api/admin/schema-repair/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockRunMigrations = runMigrations as unknown as jest.Mock;
const mockExecute = (db as unknown as { execute: jest.Mock }).execute;

/** Every table the app declares — the same derivation the route uses. */
const ALL_TABLES = Object.values(schema)
  .filter((v) => is(v, PgTable))
  .map((t) => getTableName(t as PgTable))
  .sort();

const adminUser = { memberId: 1, id: 'logto-admin', role: 'admin', name: 'Admin' };

/** Make the pg_class read report every table except `absent`. */
function liveTablesExcept(absent: string[] = []) {
  return () =>
    Promise.resolve(ALL_TABLES.filter((t) => !absent.includes(t)).map((name) => ({ name })));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetAuthedUser.mockResolvedValue(adminUser);
  mockExecute.mockImplementation(liveTablesExcept());
  mockRunMigrations.mockResolvedValue({ success: true, message: 'Migrations complete', failures: [] });
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('/api/admin/schema-repair', () => {
  it('requires authentication', async () => {
    mockGetAuthedUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST()).status).toBe(401);
  });

  it('requires admin — a member cannot run migrations', async () => {
    mockGetAuthedUser.mockResolvedValue({ ...adminUser, role: 'member' });
    expect((await GET()).status).toBe(403);
    expect((await POST()).status).toBe(403);
    expect(mockRunMigrations).not.toHaveBeenCalled();
  });

  it('checks EVERY declared table, not a hand-picked few', async () => {
    // The first version of this endpoint verified four tables, so "repaired"
    // could report all-clear while other tables were still missing. The list
    // is derived from the schema so a new table is covered automatically.
    const body = await (await GET()).json();
    expect(Object.keys(body.tables).sort()).toEqual(ALL_TABLES);
    expect(ALL_TABLES.length).toBeGreaterThan(10);
    // Spot-check tables beyond the original four.
    expect(body.tables.rsvps).toBe(true);
    expect(body.tables.push_subscriptions).toBe(true);
    expect(body.tables.event_mutes).toBe(true);
  });

  it('GET reports presence without running migrations', async () => {
    mockExecute.mockImplementation(liveTablesExcept(['analytics_events']));
    const body = await (await GET()).json();
    expect(body.tables.members).toBe(true);
    expect(body.tables.analytics_events).toBe(false);
    expect(mockRunMigrations).not.toHaveBeenCalled();
  });

  it('POST reports repaired when every expected table is present afterwards', async () => {
    const body = await (await POST()).json();
    expect(mockRunMigrations).toHaveBeenCalled();
    expect(body.repaired).toBe(true);
    expect(body.missing).toEqual([]);
  });

  it('POST surfaces per-statement failures so a data problem is visible', async () => {
    mockRunMigrations.mockResolvedValue({
      success: false,
      message: 'Migrations completed with 1 failed statement(s)',
      failures: [
        {
          statement: 'ALTER TABLE members ADD CONSTRAINT members_clerk_id_key UNIQUE (clerk_id);',
          error: 'could not create unique index — key is duplicated',
        },
      ],
    });

    const body = await (await POST()).json();

    expect(body.success).toBe(false);
    expect(body.failures[0].statement).toContain('members_clerk_id_key');
    // Tables can still all be present despite a failed constraint — the two
    // states are reported separately rather than conflated.
    expect(body.repaired).toBe(true);
  });

  it('POST names every table still missing after the run', async () => {
    mockExecute.mockImplementation(liveTablesExcept(['newsletter_subscribers', 'analytics_events']));
    const body = await (await POST()).json();
    expect(body.repaired).toBe(false);
    expect(body.missing.sort()).toEqual(['analytics_events', 'newsletter_subscribers']);
  });

  it('reports which database reads and writes each target', async () => {
    process.env.DATABASE_URL = 'postgres://u:pw@vps.example:5432/calendar';
    const body = await (await GET()).json();
    expect(body.database.app).toBe('vps.example:5432/calendar');
    // Credentials must never reach the client.
    expect(JSON.stringify(body)).not.toContain('pw');
    delete process.env.DATABASE_URL;
  });
});
