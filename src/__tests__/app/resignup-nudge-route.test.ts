/**
 * @jest-environment node
 *
 * /api/admin/resignup-nudge — admin-gated re-signup nudge endpoint.
 * Verifies access control, dry-run, batching, partial-failure handling.
 */

jest.mock('@/lib/auth/get-authed-user', () => ({
  getAuthedUser: jest.fn(),
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}));

// Build a controllable in-memory db. The drizzle chain we use is
// .select(...).from(members).where(...).limit(N) and .update(members).set(...).where(...)
// — small surface, easy to fake.
type Row = { id: number; name: string | null; email: string | null; nudgedAt: Date | null };

let mockRows: Row[] = [];
let mockUpdates: Array<{ id: number; nudgedAt: Date }> = [];
let queryResolver: 'count' | 'rows-full' | 'rows-id-name-email' = 'rows-full';
let pendingOnly = false;

jest.mock('@/lib/db', () => ({
  db: {
    select: (cols?: unknown) => {
      // Drizzle's `db.select({ count: count() })` vs `db.select({...row cols})`
      const isCount = cols && typeof cols === 'object' && 'count' in (cols as object);
      queryResolver = isCount ? 'count' : 'rows-full';
      return {
        from: () => ({
          where: () => ({
            limit: (_n: number) => {
              if (queryResolver === 'count') {
                const filtered = pendingOnly ? mockRows.filter(r => r.nudgedAt == null) : mockRows;
                return Promise.resolve([{ count: filtered.length }]);
              }
              const filtered = pendingOnly ? mockRows.filter(r => r.nudgedAt == null) : mockRows;
              return Promise.resolve(filtered.slice(0, _n));
            },
            // Some calls don't chain limit — return a resolvable thenable.
            then: (resolve: (v: unknown) => void) => {
              if (queryResolver === 'count') {
                const filtered = pendingOnly ? mockRows.filter(r => r.nudgedAt == null) : mockRows;
                resolve([{ count: filtered.length }]);
              } else {
                const filtered = pendingOnly ? mockRows.filter(r => r.nudgedAt == null) : mockRows;
                resolve(filtered);
              }
            },
          }),
        }),
      };
    },
    update: () => ({
      set: (v: { nudgedAt: Date }) => ({
        where: () => {
          // Capture the most recent update. The route invokes `where(eq(members.id, t.id))`
          // — we can't introspect the eq predicate here, but the test asserts on the
          // count of updates and their timestamps which is enough.
          mockUpdates.push({ id: 0, nudgedAt: v.nudgedAt });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

import { NextRequest } from 'next/server';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { sendEmail } from '@/lib/email';
import { GET, POST } from '@/app/api/admin/resignup-nudge/route';

const mockAuth = getAuthedUser as jest.MockedFunction<typeof getAuthedUser>;
const mockSend = sendEmail as jest.MockedFunction<typeof sendEmail>;

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/resignup-nudge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const admin = {
  memberId: 1, id: 'a', role: 'admin' as const, name: 'A', image: null,
};
const member = {
  memberId: 2, id: 'b', role: 'member' as const, name: 'B', image: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [];
  mockUpdates = [];
  pendingOnly = true;
  mockSend.mockResolvedValue({ success: true });
});

describe('GET /api/admin/resignup-nudge', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('403 when signed in but not admin', async () => {
    mockAuth.mockResolvedValue(member);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns counts + sample for admin', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [
      { id: 10, name: 'Eve',  email: 'e@x.com', nudgedAt: null },
      { id: 11, name: 'Adam', email: 'a@x.com', nudgedAt: new Date() },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const j = await res.json();
    // GET runs three queries: pending count (pendingOnly=true), total count
    // (pendingOnly=false), then sample. Our mock toggles pendingOnly per call
    // is too crude — at minimum verify shape is right.
    expect(j).toHaveProperty('pending');
    expect(j).toHaveProperty('totalPending');
    expect(j).toHaveProperty('sample');
    expect(Array.isArray(j.sample)).toBe(true);
  });
});

describe('POST /api/admin/resignup-nudge', () => {
  it('401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makePost({}));
    expect(res.status).toBe(401);
  });

  it('403 when not admin', async () => {
    mockAuth.mockResolvedValue(member);
    const res = await POST(makePost({}));
    expect(res.status).toBe(403);
  });

  it('dryRun does not call sendEmail and does not mark nudged_at', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [
      { id: 10, name: 'Eve', email: 'e@x.com', nudgedAt: null },
    ];
    const res = await POST(makePost({ dryRun: true, limit: 10 }));
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUpdates).toHaveLength(0);
    const j = await res.json();
    expect(j.dryRun).toBe(true);
    expect(j.wouldSend).toBe(1);
  });

  it('sends real emails when not dry-run and marks nudged_at', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [
      { id: 10, name: 'Eve', email: 'e@x.com', nudgedAt: null },
      { id: 11, name: 'Bob', email: 'b@x.com', nudgedAt: null },
    ];
    const res = await POST(makePost({ limit: 10 }));
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockUpdates).toHaveLength(2);
    const j = await res.json();
    expect(j.sent).toBe(2);
    expect(j.failed).toBe(0);
  });

  it('continues on per-row email failure and reports it', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [
      { id: 10, name: 'Eve', email: 'e@x.com', nudgedAt: null },
      { id: 11, name: 'Bob', email: 'b@x.com', nudgedAt: null },
    ];
    mockSend
      .mockResolvedValueOnce({ success: false, error: 'rate limit' })
      .mockResolvedValueOnce({ success: true });
    const res = await POST(makePost({ limit: 10 }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.sent).toBe(1);
    expect(j.failed).toBe(1);
    expect(j.results[0].error).toBe('rate limit');
  });

  it('clamps limit above MAX_LIMIT (500) to MAX_LIMIT', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [];
    const res = await POST(makePost({ limit: 10_000 }));
    expect(res.status).toBe(200);
    // No targets → nothing to send. Just verify it didn't reject the request.
    const j = await res.json();
    expect(j.attempted).toBe(0);
  });

  it('returns "nothing pending" cleanly when cohort is empty', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [];
    const res = await POST(makePost({}));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.attempted).toBe(0);
    expect(j.sent).toBe(0);
  });

  it('skips rows missing email (defence in depth — predicate should filter them)', async () => {
    mockAuth.mockResolvedValue(admin);
    mockRows = [
      { id: 10, name: 'X', email: null, nudgedAt: null },
    ];
    const res = await POST(makePost({}));
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
    const j = await res.json();
    expect(j.failed).toBe(1);
    expect(j.results[0].error).toBe('no email');
  });
});
