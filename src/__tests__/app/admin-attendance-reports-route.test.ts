/**
 * @jest-environment node
 *
 * GET /api/admin/attendance-reports — admin-only endpoint that returns
 * recent attendance reports aggregated per event. Aggregation: total reports,
 * count happened, count host_present, and the per-row notes.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/attendance-reports/aggregate', () => ({
  aggregateAllReports: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { aggregateAllReports } from '@/lib/attendance-reports/aggregate';
import { GET } from '@/app/api/admin/attendance-reports/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockAggregate = aggregateAllReports as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

function makeReq(): import('next/server').NextRequest {
  return {} as unknown as import('next/server').NextRequest;
}

describe('GET /api/admin/attendance-reports', () => {
  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    expect(mockAggregate).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is host (not admin)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, clerkId: null, name: 'H', email: null, image: null, role: 'host',
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it('returns 200 + aggregated reports when caller is admin', async () => {
    const aggregated = [
      {
        eventId: 5,
        eventTitle: 'Stewards Circle',
        eventStartsAt: '2026-04-04T18:00:00Z',
        totalReports: 3,
        happenedYes: 2,
        hostPresentYes: 2,
        reports: [
          {
            id: 1, reporterId: 'u-1', reporterName: 'A',
            eventHappened: true, hostPresent: true, note: null,
            createdAt: '2026-04-05T01:00:00Z',
          },
          {
            id: 2, reporterId: 'u-2', reporterName: 'B',
            eventHappened: true, hostPresent: true, note: 'great session',
            createdAt: '2026-04-05T02:00:00Z',
          },
          {
            id: 3, reporterId: 'u-3', reporterName: 'C',
            eventHappened: false, hostPresent: false, note: 'never started',
            createdAt: '2026-04-05T03:00:00Z',
          },
        ],
      },
    ];
    mockAggregate.mockResolvedValue(aggregated);
    mockGetCurrentMember.mockResolvedValue({
      id: 1, clerkId: null, name: 'Admin', email: null, image: null, role: 'admin',
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual(aggregated);
    expect(mockAggregate).toHaveBeenCalledTimes(1);
  });

  it('returns 200 + empty array when there are no reports', async () => {
    mockAggregate.mockResolvedValue([]);
    mockGetCurrentMember.mockResolvedValue({
      id: 1, clerkId: null, name: 'Admin', email: null, image: null, role: 'admin',
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });
});
