/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({ getAuthedUser: jest.fn() }));
jest.mock('@/lib/db', () => ({ db: { execute: jest.fn() } }));
jest.mock('@/lib/db/migrate', () => ({ runMigrations: jest.fn() }));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { db } from '@/lib/db';
import { runMigrations } from '@/lib/db/migrate';
import { GET, POST } from '@/app/api/admin/schema-repair/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockRunMigrations = runMigrations as unknown as jest.Mock;
const mockExecute = (db as unknown as { execute: jest.Mock }).execute;

const adminUser = { memberId: 1, id: 'logto-admin', role: 'admin', name: 'Admin' };

/** to_regclass returns non-null for present tables; `absent` names return false. */
function presenceFor(absent: string[]) {
  return (query: unknown) => {
    const text = JSON.stringify(query);
    const missing = absent.some((name) => text.includes(name));
    return Promise.resolve([{ present: !missing }]);
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetAuthedUser.mockResolvedValue(adminUser);
  mockExecute.mockImplementation(presenceFor([]));
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
  });

  it('GET reports table presence without running migrations', async () => {
    mockExecute.mockImplementation(presenceFor(['analytics_events']));
    const body = await (await GET()).json();
    expect(body.tables.members).toBe(true);
    expect(body.tables.analytics_events).toBe(false);
    expect(mockRunMigrations).not.toHaveBeenCalled();
  });

  it('POST reports repaired when every expected table is present afterwards', async () => {
    mockRunMigrations.mockResolvedValue({ success: true, message: 'Migrations complete', failures: [] });
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
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].statement).toContain('members_clerk_id_key');
    // Tables can still all be present despite a failed constraint — the two
    // states are reported separately rather than conflated.
    expect(body.repaired).toBe(true);
  });

  it('POST reports which tables are still missing after the run', async () => {
    mockRunMigrations.mockResolvedValue({ success: true, message: 'Migrations complete', failures: [] });
    mockExecute.mockImplementation(presenceFor(['newsletter_subscribers']));

    const body = await (await POST()).json();

    expect(body.repaired).toBe(false);
    expect(body.missing).toEqual(['newsletter_subscribers']);
  });
});
