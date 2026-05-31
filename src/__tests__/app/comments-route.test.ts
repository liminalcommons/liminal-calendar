/**
 * @jest-environment node
 *
 * Route handlers for /api/events/[id]/comments — GET and POST.
 *
 * GET is public (no auth). POST requires a Member. The route validates the
 * event exists (404 if not), validates body length (400 if not 1..2000), then
 * delegates to the comments repo.
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@/lib/events/visibility', () => ({
  visibleEventsForMemberCondition: jest.fn(() => ({ __vis: 'member' })),
  publicOnlyEventsCondition: jest.fn(() => ({ __vis: 'public' })),
}));
jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/comments/repo', () => ({
  createComment: jest.fn(),
  listComments: jest.fn(),
  COMMENT_MAX_LENGTH: 2000,
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { createComment, listComments } from '@/lib/comments/repo';
import { GET, POST } from '@/app/api/events/[id]/comments/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockCreateComment = createComment as unknown as jest.Mock;
const mockListComments = listComments as unknown as jest.Mock;

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

describe('GET /api/events/[id]/comments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 for non-numeric event id', async () => {
    const res = await GET(makeReq(null), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when event does not exist', async () => {
    setupEventMock([]);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(404);
  });

  it('returns 200 with empty comments array for an event with no comments', async () => {
    setupEventMock([{ id: 5 }]);
    mockListComments.mockResolvedValue([]);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ comments: [] });
    expect(mockListComments.mock.calls[0][1]).toBe(5);
  });

  it('returns 200 with the listed comments', async () => {
    const rows = [
      {
        id: 1,
        eventId: 5,
        authorId: 'u-1',
        authorName: 'Alice',
        authorImage: 'a.png',
        body: 'hi',
        createdAt: new Date('2026-05-02T00:00:00Z').toISOString(),
        deletedAt: null,
      },
    ];
    setupEventMock([{ id: 5 }]);
    mockListComments.mockResolvedValue(rows);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe('hi');
  });

  it('does NOT require authentication', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    setupEventMock([{ id: 5 }]);
    mockListComments.mockResolvedValue([]);
    const res = await GET(makeReq(null), eventParams);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/events/[id]/comments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateComment.mockResolvedValue({
      id: 99,
      eventId: 5,
      authorId: 'u-1',
      authorName: 'Alice',
      authorImage: null,
      body: 'hello',
      createdAt: new Date('2026-05-02T00:00:00Z'),
      deletedAt: null,
    });
  });

  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await POST(makeReq({ body: 'hi' }), eventParams);
    expect(res.status).toBe(401);
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric event id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(makeReq({ body: 'hi' }), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await POST(makeReq('__INVALID__'), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ body: '   ' }), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 for body over 2000 chars', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ body: 'x'.repeat(2001) }), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 404 when event does not exist', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    setupEventMock([]);
    const res = await POST(makeReq({ body: 'hi' }), eventParams);
    expect(res.status).toBe(404);
  });

  it('creates a comment using logtoId for a Logto Member', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'Alice', email: 'a@x.y', image: 'img.png', role: 'member',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ body: 'hello' }), eventParams);
    expect(res.status).toBe(200);
    const args = mockCreateComment.mock.calls[0][1];
    // authorId is the legacy string identity: logtoId takes precedence.
    expect(args.authorId).toBe('logto_1');
    // memberId is the canonical Member.id passed straight through.
    expect(args.memberId).toBe(1);
    expect(args.authorName).toBe('Alice');
    expect(args.authorImage).toBe('img.png');
    expect(args.body).toBe('hello');
    expect(args.eventId).toBe(5);
  });

  it('creates a comment using clerkId for a Clerk-only Member', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 2, logtoId: null, clerkId: 'clerk_x', name: 'Bob', email: null, image: null, role: 'member',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ body: 'hi' }), eventParams);
    expect(res.status).toBe(200);
    const args = mockCreateComment.mock.calls[0][1];
    // No logtoId, so authorId falls back to clerkId.
    expect(args.authorId).toBe('clerk_x');
    expect(args.memberId).toBe(2);
  });

  it('returns the created comment in the response body', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto_1', clerkId: null, name: 'Alice', email: null, image: null, role: 'member',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ body: 'hello' }), eventParams);
    const body = await res.json();
    expect(body.comment.id).toBe(99);
    expect(body.comment.body).toBe('hello');
  });
});
