import {
  diffEventForNotification,
  fanoutEventChanged,
  fanoutEventCancelled,
  fanoutAttendanceNegative,
} from '@/lib/notifications/fanout';

jest.mock('@/lib/notifications/inbox/repo', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('@/lib/notifications/push', () => ({
  sendPushToUsers: jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));

import { createNotification } from '@/lib/notifications/inbox/repo';
import { sendPushToUsers } from '@/lib/notifications/push';

const mockCreate = createNotification as unknown as jest.Mock;
const mockPush = sendPushToUsers as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// Minimal db stub for listRecipients — returns a fixed RSVP set.
function dbWithRecipients(userIds: string[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(userIds.map((u) => ({ userId: u }))),
      }),
    }),
  };
}

describe('diffEventForNotification', () => {
  const base = {
    id: 1,
    title: 'Yoga',
    description: 'Vinyasa',
    startsAt: '2026-06-01T10:00:00Z',
    endsAt: '2026-06-01T11:00:00Z',
    timezone: 'UTC',
    location: 'Park',
  };

  it('returns null when nothing notable changed', () => {
    expect(diffEventForNotification(base, { ...base })).toBeNull();
  });

  it('detects title change', () => {
    const out = diffEventForNotification(base, { ...base, title: 'Yoga (Vinyasa)' });
    expect(out?.changedFields).toEqual(['title']);
    expect(out?.summary).toMatch(/title/i);
  });

  it('detects startsAt change (timestamp comparison, not string)', () => {
    const out = diffEventForNotification(base, {
      ...base,
      startsAt: new Date('2026-06-01T11:00:00Z'),
    });
    expect(out?.changedFields).toEqual(['startsAt']);
  });

  it('treats null and missing optional field as equal', () => {
    const noLoc = { ...base, location: null };
    expect(diffEventForNotification(noLoc, { ...noLoc, location: undefined as unknown as string })).toBeNull();
  });

  it('lists multiple changed fields with combined summary', () => {
    const out = diffEventForNotification(base, {
      ...base,
      startsAt: '2026-06-02T10:00:00Z',
      location: 'Beach',
    });
    expect(out?.changedFields.sort()).toEqual(['location', 'startsAt']);
    expect(out?.summary).toContain('and');
  });

  it('ignores image / recurrence-rule / id changes (not part of A3 surface)', () => {
    expect(diffEventForNotification(base, { ...base })).toBeNull();
  });
});

describe('fanoutEventChanged', () => {
  it('writes inbox row + sends push for each RSVPer except the actor', async () => {
    const db = dbWithRecipients(['u-1', 'u-2', 'u-3']);
    mockPush.mockResolvedValue({ sent: 3, failed: 0 });
    const event = {
      id: 5,
      title: 'Yoga',
      startsAt: '2026-06-01T10:00:00Z',
    };
    const diff = { changedFields: ['startsAt' as const], summary: 'Start time updated' };
    const out = await fanoutEventChanged(db, event, diff, { id: 'host-1', name: 'Host' });
    expect(out.inboxCreated).toBe(3);
    expect(out.pushSent).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockCreate.mock.calls[0][1]).toMatchObject({
      type: 'event.changed',
      eventId: 5,
      actorId: 'host-1',
      actorName: 'Host',
    });
  });

  it('returns ZERO when there are no recipients', async () => {
    const db = dbWithRecipients([]);
    const out = await fanoutEventChanged(
      db,
      { id: 5, title: 'X', startsAt: '2026-06-01T10:00:00Z' },
      { changedFields: ['title'], summary: 'Title updated' },
      { id: 'host', name: 'Host' },
    );
    expect(out.inboxCreated).toBe(0);
    expect(out.pushSent).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('fanoutEventCancelled', () => {
  it('writes inbox + push, eventId is null on inbox row (cascade-delete safe)', async () => {
    const db = dbWithRecipients(['u-1', 'u-2']);
    mockPush.mockResolvedValue({ sent: 2, failed: 0 });
    const out = await fanoutEventCancelled(
      db,
      { id: 9, title: 'Cancelled Event', startsAt: '2026-06-01T10:00:00Z' },
      { id: 'host', name: 'Host' },
    );
    expect(out.inboxCreated).toBe(2);
    expect(out.pushSent).toBe(2);
    const firstCall = mockCreate.mock.calls[0][1];
    expect(firstCall.type).toBe('event.cancelled');
    expect(firstCall.eventId).toBeNull();
    expect(firstCall.payload).toMatchObject({ cancelledEventId: 9 });
  });
});

describe('fanoutAttendanceNegative', () => {
  const event = {
    id: 12,
    title: 'Coffee Club',
    creatorId: 'host-1',
    creatorName: 'Host',
    description: null,
    startsAt: new Date(),
    endsAt: null,
    timezone: 'UTC',
    location: null,
    imageUrl: null,
    recurrenceRule: null,
    creatorImage: null,
    hyloGroupId: null,
    hyloPostId: null,
    createdAt: null,
    updatedAt: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('does NOTHING when both eventHappened and hostPresent are true', async () => {
    const out = await fanoutAttendanceNegative(
      {} as never,
      event,
      { eventHappened: true, hostPresent: true },
      { id: 'reporter', name: 'Reporter' },
    );
    expect(out.inboxCreated).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('notifies host on eventHappened=false', async () => {
    mockPush.mockResolvedValue({ sent: 1, failed: 0 });
    const out = await fanoutAttendanceNegative(
      {} as never,
      event,
      { eventHappened: false, hostPresent: true },
      { id: 'reporter', name: 'Reporter' },
    );
    expect(out.inboxCreated).toBe(1);
    expect(mockCreate.mock.calls[0][1]).toMatchObject({
      userId: 'host-1',
      type: 'attendance.negative',
      eventId: 12,
    });
    expect(mockCreate.mock.calls[0][1].body).toMatch(/didn.?t happen/);
  });

  it('notifies host on hostPresent=false', async () => {
    mockPush.mockResolvedValue({ sent: 1, failed: 0 });
    const out = await fanoutAttendanceNegative(
      {} as never,
      event,
      { eventHappened: true, hostPresent: false },
      { id: 'reporter', name: 'Reporter' },
    );
    expect(out.inboxCreated).toBe(1);
    expect(mockCreate.mock.calls[0][1].body).toMatch(/weren.?t there/);
  });

  it('skips when host themselves filed the negative report', async () => {
    const out = await fanoutAttendanceNegative(
      {} as never,
      event,
      { eventHappened: false, hostPresent: false },
      { id: 'host-1', name: 'Host' },
    );
    expect(out.inboxCreated).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
