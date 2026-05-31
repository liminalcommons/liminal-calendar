/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/notifications/inbox/repo', () => ({
  listNotificationsForUser: jest.fn(),
  countUnseen: jest.fn(),
  markAllSeen: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  listNotificationsForUser,
  countUnseen,
  markAllSeen,
} from '@/lib/notifications/inbox/repo';
import { GET } from '@/app/api/notifications/route';
import { POST as POST_SEEN } from '@/app/api/notifications/seen/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockList = listNotificationsForUser as unknown as jest.Mock;
const mockCount = countUnseen as unknown as jest.Mock;
const mockMarkAllSeen = markAllSeen as unknown as jest.Mock;

function makeReq(url: string): import('next/server').NextRequest {
  return { url } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/notifications', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await GET(makeReq('http://localhost/api/notifications'));
    expect(res.status).toBe(401);
  });

  it('returns notifications + unseenCount for the current user', async () => {
    mockGetCurrentMember.mockResolvedValue({
      logtoId: 'h-1',
      clerkId: null,
      name: 'Alice',
    });
    mockList.mockResolvedValue([
      { id: 1, title: 'Reminder' },
      { id: 2, title: 'Did it happen?' },
    ]);
    mockCount.mockResolvedValue(2);

    const res = await GET(makeReq('http://localhost/api/notifications'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.unseenCount).toBe(2);

    // Repo called with hyloId as the resolved user id.
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      'h-1',
      expect.objectContaining({ unseenOnly: false }),
    );
    expect(mockCount).toHaveBeenCalledWith(expect.anything(), 'h-1');
  });

  it('falls back to clerkId when hyloId is null', async () => {
    mockGetCurrentMember.mockResolvedValue({
      logtoId: null,
      clerkId: 'clerk_xyz',
      name: 'Bob',
    });
    mockList.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeReq('http://localhost/api/notifications'));
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      'clerk_xyz',
      expect.anything(),
    );
  });

  it('passes ?limit through to the repo', async () => {
    mockGetCurrentMember.mockResolvedValue({ logtoId: 'h-1', name: 'A' });
    mockList.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeReq('http://localhost/api/notifications?limit=5'));
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      'h-1',
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('passes ?unseenOnly=true through to the repo', async () => {
    mockGetCurrentMember.mockResolvedValue({ logtoId: 'h-1', name: 'A' });
    mockList.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await GET(makeReq('http://localhost/api/notifications?unseenOnly=true'));
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      'h-1',
      expect.objectContaining({ unseenOnly: true }),
    );
  });

  it('returns 500 when the repo throws', async () => {
    mockGetCurrentMember.mockResolvedValue({ logtoId: 'h-1', name: 'A' });
    mockList.mockRejectedValue(new Error('db down'));
    mockCount.mockResolvedValue(0);

    const res = await GET(makeReq('http://localhost/api/notifications'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/notifications/seen', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await POST_SEEN();
    expect(res.status).toBe(401);
  });

  it('marks all unseen for the current user, returns marked count', async () => {
    mockGetCurrentMember.mockResolvedValue({
      logtoId: 'h-1',
      clerkId: null,
      name: 'A',
    });
    mockMarkAllSeen.mockResolvedValue(3);

    const res = await POST_SEEN();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marked).toBe(3);
    expect(mockMarkAllSeen).toHaveBeenCalledWith(expect.anything(), 'h-1');
  });

  it('returns 500 when the repo throws', async () => {
    mockGetCurrentMember.mockResolvedValue({ logtoId: 'h-1', name: 'A' });
    mockMarkAllSeen.mockRejectedValue(new Error('db down'));

    const res = await POST_SEEN();
    expect(res.status).toBe(500);
  });
});
