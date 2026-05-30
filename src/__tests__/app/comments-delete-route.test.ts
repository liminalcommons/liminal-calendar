/**
 * @jest-environment node
 *
 * DELETE /api/events/[id]/comments/[commentId]
 *
 * Auth gate: only the comment author OR an admin may soft-delete.
 * 401 anon, 400 invalid id, 404 no such comment, 403 not authorized, 200 happy.
 */

jest.mock('@/lib/auth/get-current-member', () => ({
  getCurrentMember: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/comments/repo', () => ({
  getComment: jest.fn(),
  softDeleteComment: jest.fn(),
}));

import { getCurrentMember } from '@/lib/auth/get-current-member';
import { getComment, softDeleteComment } from '@/lib/comments/repo';
import { DELETE } from '@/app/api/events/[id]/comments/[commentId]/route';

const mockGetCurrentMember = getCurrentMember as unknown as jest.Mock;
const mockGetComment = getComment as unknown as jest.Mock;
const mockSoftDelete = softDeleteComment as unknown as jest.Mock;

function makeReq(): import('next/server').NextRequest {
  return {} as unknown as import('next/server').NextRequest;
}

const goodParams = {
  params: Promise.resolve({ id: '5', commentId: '99' }),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSoftDelete.mockResolvedValue(undefined);
});

describe('DELETE /api/events/[id]/comments/[commentId]', () => {
  it('returns 401 when no Member is resolved', async () => {
    mockGetCurrentMember.mockResolvedValue(null);
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(401);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric event id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: 'abc', commentId: '99' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric comment id', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: '5', commentId: 'xyz' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the comment does not exist', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue(undefined);
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the comment exists but is on a different event', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 999, authorId: 'h-1', deletedAt: null,
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the comment is already soft-deleted', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 1, hyloId: 'h-1', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 5, authorId: 'h-1', deletedAt: new Date(),
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is neither the author nor an admin', async () => {
    // Different member.id than the comment's memberId → not the author.
    mockGetCurrentMember.mockResolvedValue({
      id: 2, logtoId: 'someone-else', clerkId: null, name: 'B', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 5, memberId: 1, authorId: 'h-author', deletedAt: null,
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(403);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes when caller IS the author (matched by canonical memberId)', async () => {
    // Authorship keys on member.id === comment.memberId, NOT the provider string.
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto-author', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 5, memberId: 1, authorId: 'legacy-string-mismatch', deletedAt: null,
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(200);
    expect(mockSoftDelete).toHaveBeenCalledTimes(1);
    expect(mockSoftDelete.mock.calls[0][1]).toBe(99);
  });

  it('returns 403 when the comment has a null memberId (cannot prove authorship)', async () => {
    // A legacy comment with no canonical memberId must NOT be deletable by a
    // non-admin, even if provider strings happen to align — fail closed.
    mockGetCurrentMember.mockResolvedValue({
      id: 1, logtoId: 'logto-author', clerkId: null, name: 'A', email: null, image: null, role: 'member',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 5, memberId: null, authorId: 'logto-author', deletedAt: null,
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(403);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes when caller is admin (any author)', async () => {
    mockGetCurrentMember.mockResolvedValue({
      id: 3, logtoId: 'logto-admin', clerkId: null, name: 'Admin', email: null, image: null, role: 'admin',
    });
    mockGetComment.mockResolvedValue({
      id: 99, eventId: 5, memberId: 2, authorId: 'someone-else', deletedAt: null,
    });
    const res = await DELETE(makeReq(), goodParams);
    expect(res.status).toBe(200);
    expect(mockSoftDelete).toHaveBeenCalledTimes(1);
  });
});
