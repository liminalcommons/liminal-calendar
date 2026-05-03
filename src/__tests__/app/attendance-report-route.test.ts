/**
 * @jest-environment node
 *
 * Route handlers for /api/events/[id]/attendance-report — GET and POST.
 *
 * Both require auth. POST is gated by event endsAt (or starts_at + 1h fallback)
 * being in the past — reports for not-yet-ended events return 400.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/attendance-reports/repo', () => ({
  upsertAttendanceReport: jest.fn(),
  getAttendanceReportForUser: jest.fn(),
  REPORT_NOTE_MAX_LENGTH: 1000,
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  upsertAttendanceReport,
  getAttendanceReportForUser,
} from '@/lib/attendance-reports/repo';
import {
  GET,
  POST,
} from '@/app/api/events/[id]/attendance-report/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockUpsert = upsertAttendanceReport as unknown as jest.Mock;
const mockGetReport = getAttendanceReportForUser as unknown as jest.Mock;

function setupEventMock(eventRow: unknown[] | null) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  dbModule.db.select = () => ({
    from: () => ({
      where: () => Promise.resolve(eventRow ?? []),
    }),
  });
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => {
      if (body === '__INVALID__') return Promise.reject(new Error('bad json'));
      return Promise.resolve(body);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const eventParams = { params: Promise.resolve({ id: '5' }) };

const yesterday = new Date(Date.now() - 86_400_000);
const tomorrow = new Date(Date.now() + 86_400_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ action: 'inserted', reportId: 7 });
});

describe('POST /api/events/[id]/attendance-report', () => {
  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric event id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(makeReq('__INVALID__'), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 when eventHappened is missing or non-boolean', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(makeReq({ hostPresent: true }), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 when hostPresent is missing or non-boolean', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(makeReq({ eventHappened: true }), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 when note is longer than 1000 characters', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([{ id: 5, ends_at: yesterday.toISOString(), starts_at: yesterday.toISOString() }]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true, note: 'x'.repeat(1001) }),
      eventParams,
    );
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 404 when event does not exist', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when event has not yet ended (endsAt in the future)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([{
      id: 5,
      starts_at: tomorrow.toISOString(),
      ends_at: tomorrow.toISOString(),
    }]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 when ends_at is null and starts_at + 1h is still in the future', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    // Event starting in 30min, no ends_at → starts_at + 1h still future
    const startsIn30 = new Date(Date.now() + 30 * 60_000);
    setupEventMock([{
      id: 5,
      starts_at: startsIn30.toISOString(),
      ends_at: null,
    }]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(res.status).toBe(400);
  });

  it('upserts the report when event has ended (Hylo Member, hyloId as reporterId)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'Alice', email: null, image: null, role: 'member',
    });
    setupEventMock([{
      id: 5,
      starts_at: yesterday.toISOString(),
      ends_at: yesterday.toISOString(),
    }]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: false, note: 'no host' }),
      eventParams,
    );
    expect(res.status).toBe(200);
    const args = mockUpsert.mock.calls[0][1];
    expect(args.eventId).toBe(5);
    expect(args.reporterId).toBe('h-1');
    expect(args.reporterName).toBe('Alice');
    expect(args.eventHappened).toBe(true);
    expect(args.hostPresent).toBe(false);
    expect(args.note).toBe('no host');
  });

  it('upserts with clerkId when Member has no hyloId', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 2, hyloId: null, clerkId: 'clerk_x', name: 'Bob', email: null, image: null, role: 'member',
    });
    setupEventMock([{
      id: 5,
      starts_at: yesterday.toISOString(),
      ends_at: yesterday.toISOString(),
    }]);
    const res = await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(res.status).toBe(200);
    expect(mockUpsert.mock.calls[0][1].reporterId).toBe('clerk_x');
  });

  it('null note is preserved (not stringified)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([{
      id: 5,
      starts_at: yesterday.toISOString(),
      ends_at: yesterday.toISOString(),
    }]);
    await POST(
      makeReq({ eventHappened: true, hostPresent: true }),
      eventParams,
    );
    expect(mockUpsert.mock.calls[0][1].note).toBeNull();
  });
});

describe('GET /api/events/[id]/attendance-report', () => {
  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-numeric event id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await GET(makeReq(null), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 + { report: null } when current user has no report', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetReport.mockResolvedValue(undefined);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ report: null });
  });

  it('returns the user report when one exists', async () => {
    const row = {
      id: 7,
      eventId: 5,
      reporterId: 'h-1',
      reporterName: 'Alice',
      eventHappened: true,
      hostPresent: false,
      note: null,
    };
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetReport.mockResolvedValue(row);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.id).toBe(7);
    expect(body.report.eventHappened).toBe(true);
    expect(body.report.hostPresent).toBe(false);
  });
});
