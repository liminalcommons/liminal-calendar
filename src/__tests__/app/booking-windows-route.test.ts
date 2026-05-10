/**
 * @jest-environment node
 *
 * Tests for /api/booking/windows — Task 3 of Plan 3 (1:1 Booking).
 *
 * Covers GET (list own), PUT (replace-set), plus detectOverlap unit tests.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { GET, PUT } from '@/app/api/booking/windows/route';
import { detectOverlap } from '@/lib/booking/windows-repo';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

function makeReqBadJson(): import('next/server').NextRequest {
  return {
    json: () => Promise.reject(new Error('bad json')),
  } as unknown as import('next/server').NextRequest;
}

interface DbMockOpts {
  selectAll?: unknown[];
  insertReturning?: unknown[];
  deleteReturning?: unknown[];
}

function setupDbMocks(opts: DbMockOpts) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };

  const whereChain = {
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(opts.selectAll ?? []).then(resolve),
  };
  const fromChain = { where: jest.fn(() => whereChain) };
  dbModule.db.select = jest.fn(() => ({ from: jest.fn(() => fromChain) }));

  const insertValues: jest.Mock = jest.fn(() => ({
    returning: jest.fn(() => Promise.resolve(opts.insertReturning ?? [])),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(opts.insertReturning ?? []).then(resolve),
  }));
  dbModule.db.insert = jest.fn(() => ({ values: insertValues }));

  const deleteWhere: jest.Mock = jest.fn(() => ({
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(opts.deleteReturning ?? []).then(resolve),
  }));
  dbModule.db.delete = jest.fn(() => ({ where: deleteWhere }));

  return { insertValues, deleteWhere };
}

const validWindow = {
  dayOfWeek: 1,
  startMinute: 540, // 9:00
  endMinute: 720, // 12:00
  timezone: 'America/New_York',
};

describe('detectOverlap (unit)', () => {
  it('empty array → false', () => {
    expect(detectOverlap([])).toBe(false);
  });

  it('non-overlapping same day → false', () => {
    expect(
      detectOverlap([
        { dayOfWeek: 1, startMinute: 540, endMinute: 600, timezone: 'UTC' },
        { dayOfWeek: 1, startMinute: 660, endMinute: 720, timezone: 'UTC' },
      ]),
    ).toBe(false);
  });

  it('overlapping same day → true', () => {
    expect(
      detectOverlap([
        { dayOfWeek: 1, startMinute: 540, endMinute: 660, timezone: 'UTC' },
        { dayOfWeek: 1, startMinute: 600, endMinute: 720, timezone: 'UTC' },
      ]),
    ).toBe(true);
  });

  it('different days never overlap → false', () => {
    expect(
      detectOverlap([
        { dayOfWeek: 1, startMinute: 540, endMinute: 720, timezone: 'UTC' },
        { dayOfWeek: 2, startMinute: 540, endMinute: 720, timezone: 'UTC' },
      ]),
    ).toBe(false);
  });

  it('touching (end===start) is NOT overlap → false', () => {
    expect(
      detectOverlap([
        { dayOfWeek: 1, startMinute: 540, endMinute: 600, timezone: 'UTC' },
        { dayOfWeek: 1, startMinute: 600, endMinute: 660, timezone: 'UTC' },
      ]),
    ).toBe(false);
  });
});

describe('GET /api/booking/windows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns caller's windows", async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectAll: [
        { id: 10, ownerMemberId: 1, dayOfWeek: 1, startMinute: 540, endMinute: 720 },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].dayOfWeek).toBe(1);
  });
});

describe('PUT /api/booking/windows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await PUT(makeReq([validWindow]));
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await PUT(makeReqBadJson());
    expect(res.status).toBe(400);
  });

  it('400 when endMinute <= startMinute', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await PUT(makeReq([{ ...validWindow, endMinute: 540 }]));
    expect(res.status).toBe(400);
  });

  it('400 when dayOfWeek out of range', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await PUT(makeReq([{ ...validWindow, dayOfWeek: 7 }]));
    expect(res.status).toBe(400);
  });

  it('400 when timezone missing', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const { timezone: _omit, ...rest } = validWindow;
    void _omit;
    const res = await PUT(makeReq([rest]));
    expect(res.status).toBe(400);
  });

  it('400 on overlapping windows', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await PUT(
      makeReq([
        { dayOfWeek: 1, startMinute: 540, endMinute: 660, timezone: 'UTC' },
        { dayOfWeek: 1, startMinute: 600, endMinute: 720, timezone: 'UTC' },
      ]),
    );
    expect(res.status).toBe(400);
  });

  it('200 success: delete then insert with dual-write fields', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 7,
      logtoId: 'lg_seven',
      clerkId: null,
      hyloId: null,
    });
    const { insertValues, deleteWhere } = setupDbMocks({
      insertReturning: [{ id: 99 }],
      selectAll: [{ id: 99, ownerMemberId: 7, ...validWindow }],
    });
    const res = await PUT(makeReq([validWindow]));
    expect(res.status).toBe(200);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const insertedRows = insertValues.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].ownerId).toBe('lg_seven');
    expect(insertedRows[0].ownerMemberId).toBe(7);
    expect(insertedRows[0].dayOfWeek).toBe(1);
  });

  it('200 with empty array: delete called, NO insert', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 7, logtoId: 'lg_seven' });
    const { insertValues, deleteWhere } = setupDbMocks({ selectAll: [] });
    const res = await PUT(makeReq([]));
    expect(res.status).toBe(200);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
