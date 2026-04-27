/**
 * @jest-environment node
 */
// Need Node env (not jsdom) for the global Response constructor used by
// the route handler. jsdom doesn't expose Response by default.

// Mock all dependencies before importing the route handler.
jest.mock('@clerk/nextjs/webhooks', () => ({
  verifyWebhook: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __isMockDb: true },
}));
jest.mock('@/lib/auth/sync-clerk-member-with-merge', () => ({
  syncClerkMemberWithMerge: jest.fn(),
}));

import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { syncClerkMemberWithMerge } from '@/lib/auth/sync-clerk-member-with-merge';
import { POST } from '@/app/api/webhooks/clerk/route';

const mockVerifyWebhook = verifyWebhook as unknown as jest.Mock;
const mockSync = syncClerkMemberWithMerge as unknown as jest.Mock;

function makeReq(headers: Record<string, string> = {}): import('next/server').NextRequest {
  // Minimal request shape — the route only reads headers and passes the
  // request to verifyWebhook (which is mocked).
  return {
    headers: { get: (k: string) => headers[k] ?? null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('POST /api/webhooks/clerk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when signature verification fails', async () => {
    mockVerifyWebhook.mockRejectedValue(new Error('bad signature'));

    const res = await POST(makeReq({ 'svix-id': 'msg_test_400' }));
    expect(res.status).toBe(400);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('dispatches user.created events to syncClerkMemberWithMerge and returns 200', async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'user_42',
        email_addresses: [
          { id: 'idn_1', email_address: 'a@x.y', verification: { status: 'verified' } },
        ],
        primary_email_address_id: 'idn_1',
        first_name: 'Alice',
        last_name: 'Doe',
        image_url: null,
      },
    });

    const res = await POST(makeReq({ 'svix-id': 'msg_test_ok' }));
    expect(res.status).toBe(200);
    expect(mockSync).toHaveBeenCalledTimes(1);
    const [, input] = mockSync.mock.calls[0];
    expect(input.clerkId).toBe('user_42');
    expect(input.email).toBe('a@x.y');
    expect(input.emailVerified).toBe(true);
  });

  it('returns 200 without syncing for non-user.created event types', async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'user_x' },
    });

    const res = await POST(makeReq({ 'svix-id': 'msg_test_skip' }));
    expect(res.status).toBe(200);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('returns 500 when the sync helper throws', async () => {
    mockVerifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'user_err',
        email_addresses: [],
        primary_email_address_id: null,
        first_name: null,
        last_name: null,
        image_url: null,
      },
    });
    mockSync.mockRejectedValue(new Error('DB down'));

    const res = await POST(makeReq({ 'svix-id': 'msg_test_500' }));
    expect(res.status).toBe(500);
  });

  it('handles missing svix-id header gracefully (uses "unknown")', async () => {
    mockVerifyWebhook.mockRejectedValue(new Error('bad signature'));

    // No svix-id header — the route should still respond with 400.
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});
