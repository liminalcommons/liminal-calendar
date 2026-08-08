/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));
jest.mock('@/lib/db', () => ({ db: { __mock: true } }));
jest.mock('@/lib/analytics/repo', () => ({
  fetchRecentAnalyticsRows: jest.fn(),
  fetchAllTimeTotals: jest.fn(),
  fetchLastEventAt: jest.fn(),
  // Keep the real predicate — the point of the test is that a 42P01 is
  // classified as "table missing" rather than a generic failure.
  isMissingTableError: (err: unknown) =>
    (err as { code?: unknown } | null)?.code === '42P01',
}));

import { getAuthedUser } from '@/lib/auth/get-authed-user';
import {
  fetchRecentAnalyticsRows,
  fetchAllTimeTotals,
  fetchLastEventAt,
} from '@/lib/analytics/repo';
import { GET } from '@/app/api/admin/analytics/route';

const mockGetAuthedUser = getAuthedUser as unknown as jest.Mock;
const mockRows = fetchRecentAnalyticsRows as unknown as jest.Mock;
const mockTotals = fetchAllTimeTotals as unknown as jest.Mock;
const mockLastAt = fetchLastEventAt as unknown as jest.Mock;

const adminUser = { memberId: 1, id: 'logto-admin', role: 'admin', name: 'Admin' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetAuthedUser.mockResolvedValue(adminUser);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('GET /api/admin/analytics — health reporting', () => {
  it('rejects non-admins', async () => {
    mockGetAuthedUser.mockResolvedValue({ ...adminUser, role: 'member' });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('reports ok health with a last-event timestamp', async () => {
    mockRows.mockResolvedValue([]);
    mockTotals.mockResolvedValue({ pageviews: 10, uniqueVisitors: 4, guestEntries: 2, clicks: 3 });
    mockLastAt.mockResolvedValue('2026-08-01T10:00:00.000Z');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.health.status).toBe('ok');
    expect(body.health.tableExists).toBe(true);
    expect(body.health.lastEventAt).toBe('2026-08-01T10:00:00.000Z');
    // totalEvents spans all three event kinds so the self-test can watch it move.
    expect(body.health.totalEvents).toBe(15);
  });

  it('reports totalEvents 0 for an empty-but-present table', async () => {
    mockRows.mockResolvedValue([]);
    mockTotals.mockResolvedValue({ pageviews: 0, uniqueVisitors: 0, guestEntries: 0, clicks: 0 });
    mockLastAt.mockResolvedValue(null);

    const body = await (await GET()).json();
    expect(body.health.status).toBe('ok');
    expect(body.health.totalEvents).toBe(0);
    expect(body.health.lastEventAt).toBeNull();
  });

  it('returns an actionable table_missing payload (not a 500) on Postgres 42P01', async () => {
    const undefinedTable = Object.assign(new Error('relation "analytics_events" does not exist'), {
      code: '42P01',
    });
    mockRows.mockRejectedValue(undefinedTable);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.health.status).toBe('table_missing');
    expect(body.health.tableExists).toBe(false);
    // Zeroed structure so the panel still renders around the health notice.
    expect(body.allTime.pageviews).toBe(0);
    expect(body.windows.week.pageviews).toBe(0);
    expect(body.topPaths).toEqual([]);
  });

  it('still 500s on an unrelated database error', async () => {
    mockRows.mockRejectedValue(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to load analytics');
  });
});
