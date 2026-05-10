/**
 * @jest-environment node
 *
 * Tests for /api/booking/event-types — Task 2 of Plan 3 (1:1 Booking).
 *
 * Covers GET (list), POST (create), GET/[id], PATCH/[id], DELETE/[id].
 * Mocks getCurrentMember + db chains, following the pattern established
 * in profile-handle-route.test.ts.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  GET as listGET,
  POST as listPOST,
} from '@/app/api/booking/event-types/route';
import {
  GET as itemGET,
  PATCH as itemPATCH,
  DELETE as itemDELETE,
} from '@/app/api/booking/event-types/[id]/route';

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
  // Result of select().from().where() — list query
  selectAll?: unknown[];
  // Result of select().from().where().limit() — load single row
  selectOne?: unknown[];
  // Result of insert().values().returning()
  insertReturning?: unknown[];
  insertThrows?: unknown;
  // Result of update().set().where().returning()
  updateReturning?: unknown[];
}

function setupDbMocks(opts: DbMockOpts) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };

  // select() — supports either .from(...).where(...) (list, no limit) OR
  // .from(...).where(...).limit(...) (single).
  const whereChain = {
    limit: jest.fn(() => Promise.resolve(opts.selectOne ?? [])),
    // When awaited directly (no limit), the list path resolves with selectAll.
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(opts.selectAll ?? []).then(resolve),
  };
  const fromChain = { where: jest.fn(() => whereChain) };
  dbModule.db.select = jest.fn(() => ({ from: jest.fn(() => fromChain) }));

  const insertValues: jest.Mock = jest.fn(() => {
    if (opts.insertThrows) {
      return {
        returning: jest.fn(() => Promise.reject(opts.insertThrows)),
      };
    }
    return {
      returning: jest.fn(() => Promise.resolve(opts.insertReturning ?? [])),
    };
  });
  dbModule.db.insert = jest.fn(() => ({ values: insertValues }));

  const updateSet = jest.fn(() => ({
    where: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve(opts.updateReturning ?? [])),
    })),
  }));
  dbModule.db.update = jest.fn(() => ({ set: updateSet }));

  return { insertValues, updateSet };
}

const validBody = {
  slug: 'coffee-30',
  title: 'Coffee chat',
  description: 'Quick intro chat',
  durationMinutes: 30,
  locationKind: 'castalia',
  locationValue: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 60,
  maxDaysAhead: 30,
};

describe('POST /api/booking/event-types', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await listPOST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it('400 on invalid JSON', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await listPOST(makeReqBadJson());
    expect(res.status).toBe(400);
  });

  it('400 invalid slug (uppercase)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await listPOST(makeReq({ ...validBody, slug: 'BadSlug' }));
    expect(res.status).toBe(400);
  });

  it('400 invalid duration (out of range)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await listPOST(makeReq({ ...validBody, durationMinutes: 1 }));
    expect(res.status).toBe(400);
  });

  it('400 invalid locationKind (enum)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const res = await listPOST(makeReq({ ...validBody, locationKind: 'zoom' }));
    expect(res.status).toBe(400);
  });

  it('409 on duplicate (owner_id, slug) unique violation', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      insertThrows: new Error(
        'duplicate key value violates unique constraint "event_types_owner_slug_unique"',
      ),
    });
    const res = await listPOST(makeReq(validBody));
    expect(res.status).toBe(409);
  });

  it('201 creates row with both ownerId and ownerMemberId set', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 7,
      logtoId: 'lg_seven',
      clerkId: null,
      hyloId: null,
    });
    const { insertValues } = setupDbMocks({
      insertReturning: [{ id: 99, slug: 'coffee-30' }],
    });
    const res = await listPOST(makeReq(validBody));
    expect(res.status).toBe(201);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const inserted = insertValues.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(inserted.ownerMemberId).toBe(7);
    expect(inserted.ownerId).toBe('lg_seven');
    expect(inserted.slug).toBe('coffee-30');
    expect(inserted.durationMinutes).toBe(30);
  });

  it('falls back to stringified member id when no provider id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 42,
      logtoId: null,
      clerkId: null,
      hyloId: null,
    });
    const { insertValues } = setupDbMocks({
      insertReturning: [{ id: 1 }],
    });
    const res = await listPOST(makeReq(validBody));
    expect(res.status).toBe(201);
    const inserted = insertValues.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(inserted.ownerId).toBe('42');
    expect(inserted.ownerMemberId).toBe(42);
  });
});

describe('GET /api/booking/event-types', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await listGET();
    expect(res.status).toBe(401);
  });

  it('returns caller\'s active event types only', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectAll: [
        { id: 10, slug: 'a', ownerMemberId: 1, active: true },
        { id: 11, slug: 'b', ownerMemberId: 1, active: true },
      ],
    });
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].slug).toBe('a');
  });
});

describe('GET /api/booking/event-types/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await itemGET(makeReq({}), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('404 when not found', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({ selectOne: [] });
    const res = await itemGET(makeReq({}), { params: Promise.resolve({ id: '999' }) });
    expect(res.status).toBe(404);
  });

  it('404 when owned by someone else (no disclosure)', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 999, slug: 'foo' }],
    });
    const res = await itemGET(makeReq({}), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(404);
  });

  it('200 returns own row', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 1, slug: 'foo' }],
    });
    const res = await itemGET(makeReq({}), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(5);
  });
});

describe('PATCH /api/booking/event-types/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await itemPATCH(makeReq({ title: 'new' }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('404 when not owner', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 999, slug: 'foo' }],
    });
    const res = await itemPATCH(makeReq({ title: 'new' }), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(404);
  });

  it('200 updates allowed fields', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const { updateSet } = setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 1, slug: 'foo', title: 'old' }],
      updateReturning: [{ id: 5, title: 'new' }],
    });
    const res = await itemPATCH(makeReq({ title: 'new', durationMinutes: 45 }), {
      params: Promise.resolve({ id: '5' }),
    });
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'new', durationMinutes: 45 }),
    );
  });
});

describe('DELETE /api/booking/event-types/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await itemDELETE(makeReq({}), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(401);
  });

  it('404 when not owner', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 999 }],
    });
    const res = await itemDELETE(makeReq({}), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(404);
  });

  it('204 soft-deletes via active=false', async () => {
    mockGetCurrentMember.mockResolvedValue({ id: 1, logtoId: 'lg_1' });
    const { updateSet } = setupDbMocks({
      selectOne: [{ id: 5, ownerMemberId: 1, slug: 'foo', active: true }],
      updateReturning: [{ id: 5, active: false }],
    });
    const res = await itemDELETE(makeReq({}), { params: Promise.resolve({ id: '5' }) });
    expect(res.status).toBe(204);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });
});
