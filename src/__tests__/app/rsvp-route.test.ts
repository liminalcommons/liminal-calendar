/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/rsvp/upsert', () => ({
  upsertRsvp: jest.fn(),
}));
jest.mock('@/lib/newsletter/add-subscriber', () => ({
  addNewsletterSubscriber: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { upsertRsvp } from '@/lib/rsvp/upsert';
import { addNewsletterSubscriber } from '@/lib/newsletter/add-subscriber';
import { POST } from '@/app/api/events/[id]/rsvp/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockUpsertRsvp = upsertRsvp as unknown as jest.Mock;
const mockAddNewsletter = addNewsletterSubscriber as unknown as jest.Mock;

// Mock db.select chain (used by the route to fetch event before RSVP).
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

describe('POST /api/events/[id]/rsvp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertRsvp.mockResolvedValue(undefined);
    mockAddNewsletter.mockResolvedValue(undefined);
  });

  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await POST(makeReq({ response: 'yes' }), eventParams);
    expect(res.status).toBe(401);
    expect(mockUpsertRsvp).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid event id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: 'a@x.y', image: null,
    });
    const res = await POST(makeReq({ response: 'yes' }), {
      params: Promise.resolve({ id: 'not-a-number' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null,
    });
    const res = await POST(makeReq('__INVALID__'), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid response value', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null,
    });
    const res = await POST(makeReq({ response: 'maybe' }), eventParams);
    expect(res.status).toBe(400);
  });

  it('returns 404 when event does not exist', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null,
    });
    setupEventMock([]);
    const res = await POST(makeReq({ response: 'yes' }), eventParams);
    expect(res.status).toBe(404);
  });

  it('upserts RSVP for Hylo Member with hyloId as userId', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'Alice', email: 'a@x.y', image: 'img.png',
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ response: 'yes' }), eventParams);
    expect(res.status).toBe(200);
    const args = mockUpsertRsvp.mock.calls[0][1];
    expect(args.userId).toBe('h-1');
    expect(args.userName).toBe('Alice');
    expect(args.status).toBe('yes');
  });

  it('upserts RSVP for Clerk-only Member with clerkId as userId', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 2, hyloId: null, clerkId: 'clerk_x', name: 'Bob', email: 'b@x.y', image: null,
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(makeReq({ response: 'interested' }), eventParams);
    expect(res.status).toBe(200);
    const args = mockUpsertRsvp.mock.calls[0][1];
    expect(args.userId).toBe('clerk_x');
  });

  it('does NOT subscribe to newsletter when subscribeToNewsletter is omitted', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: 'a@x.y', image: null,
    });
    setupEventMock([{ id: 5 }]);
    await POST(makeReq({ response: 'yes' }), eventParams);
    expect(mockAddNewsletter).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when subscribeToNewsletter is false', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: 'a@x.y', image: null,
    });
    setupEventMock([{ id: 5 }]);
    await POST(makeReq({ response: 'yes', subscribeToNewsletter: false }), eventParams);
    expect(mockAddNewsletter).not.toHaveBeenCalled();
  });

  it('SUBSCRIBES to newsletter when opt-in is true and email is present', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: 'a@x.y', image: null,
    });
    setupEventMock([{ id: 5 }]);
    const res = await POST(
      makeReq({ response: 'yes', subscribeToNewsletter: true }),
      eventParams,
    );
    expect(res.status).toBe(200);
    // Allow the fire-and-forget promise microtask to resolve.
    await new Promise((r) => setImmediate(r));
    expect(mockAddNewsletter).toHaveBeenCalledTimes(1);
    expect(mockAddNewsletter.mock.calls[0][1]).toEqual({
      email: 'a@x.y',
      source: 'rsvp',
    });
  });

  it('does NOT subscribe when opt-in is true but Member has no email', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null,
    });
    setupEventMock([{ id: 5 }]);
    await POST(makeReq({ response: 'yes', subscribeToNewsletter: true }), eventParams);
    expect(mockAddNewsletter).not.toHaveBeenCalled();
  });

  it('newsletter subscribe failure does NOT fail the RSVP (fire-and-forget)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: 'a@x.y', image: null,
    });
    setupEventMock([{ id: 5 }]);
    mockAddNewsletter.mockRejectedValue(new Error('newsletter table missing'));
    const res = await POST(
      makeReq({ response: 'yes', subscribeToNewsletter: true }),
      eventParams,
    );
    expect(res.status).toBe(200);
    // Drain the rejected promise so it doesn't surface as unhandled.
    await new Promise((r) => setImmediate(r));
  });
});
