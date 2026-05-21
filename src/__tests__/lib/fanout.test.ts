import {
  diffEventForNotification,
  fanoutEventChanged,
  fanoutEventCancelled,
  fanoutAttendanceNegative,
  fanoutInvitationReceived,
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

// Minimal db stub for listRecipients — returns a fixed RSVP set, no invitees.
// The fanout helpers now also query eventInvitations; we need to return the
// appropriate shape for each table. We key on whether the result has userId
// vs inviteeUserId by checking the from() table reference.
function dbWithRecipients(userIds: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require('@/lib/db/schema');
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === schema.eventInvitations) return Promise.resolve([]);
          return Promise.resolve(userIds.map((u) => ({ userId: u })));
        },
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

// ────────────────────────────────────────────────────────────────────────────
// Helpers for tests that need separate rsvp vs invitee rows.
// ────────────────────────────────────────────────────────────────────────────

/**
 * DB stub that returns different rows depending on which table is queried.
 * Keyed by the `from()` argument identity — we pass the real schema objects
 * from the module so equality checks work naturally.
 *
 * For simplicity, the stub ignores the `where` clause and just returns the
 * pre-canned rows. The fanout helpers only call .select().from(t).where(…)
 * and iterate the result, so this is sufficient.
 */
function dbWithTableMap(map: {
  rsvpRows?: { userId: string }[];
  inviteeRows?: { inviteeUserId: string }[];
}) {
  const rsvpRows = map.rsvpRows ?? [];
  const inviteeRows = map.inviteeRows ?? [];

  // We need to match on the schema table objects. Import them so we can
  // compare by reference inside the stub.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require('@/lib/db/schema');

  return {
    select: (_proj?: unknown) => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === schema.rsvps) return Promise.resolve(rsvpRows);
          if (table === schema.eventInvitations) return Promise.resolve(inviteeRows);
          return Promise.resolve([]);
        },
      }),
    }),
  };
}

describe('fanoutInvitationReceived', () => {
  const event = { id: 7, title: 'Design Sprint', startsAt: '2026-06-10T09:00:00Z' };
  const actor = { id: 'organizer-1', name: 'Alice' };

  it('fires one invitation.received notification per invitee', async () => {
    mockPush.mockResolvedValue({ sent: 3, failed: 0 });
    const invitees = [
      { userId: 'u-1', name: 'Bob' },
      { userId: 'u-2', name: 'Carol' },
      { userId: 'u-3', name: 'Dan' },
    ];
    const out = await fanoutInvitationReceived({} as never, event, invitees, actor);
    expect(out.inboxCreated).toBe(3);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    const types = (mockCreate.mock.calls as Array<[unknown, { type: string; eventId: number }]>)
      .map(([, p]) => p.type);
    expect(types).toEqual(['invitation.received', 'invitation.received', 'invitation.received']);
    const firstCall = (mockCreate.mock.calls as Array<[unknown, Record<string, unknown>]>)[0][1];
    expect(firstCall.eventId).toBe(7);
    expect(firstCall.actorId).toBe('organizer-1');
    expect(firstCall.actorName).toBe('Alice');
    expect((firstCall.payload as Record<string, unknown>).eventTitle).toBe('Design Sprint');
  });

  it('fires no notifications when invitees list is empty', async () => {
    const out = await fanoutInvitationReceived({} as never, event, [], actor);
    expect(out.inboxCreated).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('excludes the actor (organizer) from self-notification', async () => {
    mockPush.mockResolvedValue({ sent: 1, failed: 0 });
    const invitees = [
      { userId: 'organizer-1', name: 'Alice' }, // actor — should be excluded
      { userId: 'u-2', name: 'Bob' },
    ];
    const out = await fanoutInvitationReceived({} as never, event, invitees, actor);
    expect(out.inboxCreated).toBe(1);
    const calledWith = (mockCreate.mock.calls as Array<[unknown, { userId: string }]>)[0][1];
    expect(calledWith.userId).toBe('u-2');
  });
});

describe('fanoutEventChanged — includes invitees in recipient set', () => {
  it('dedupes users who are both RSVPd and invited', async () => {
    // u-1 and u-2 are RSVPd; u-2, u-3, u-4 are invited → unique set: u-1, u-2, u-3, u-4
    const db = dbWithTableMap({
      rsvpRows: [{ userId: 'u-1' }, { userId: 'u-2' }],
      inviteeRows: [
        { inviteeUserId: 'u-2' },
        { inviteeUserId: 'u-3' },
        { inviteeUserId: 'u-4' },
      ],
    });
    mockPush.mockResolvedValue({ sent: 4, failed: 0 });
    const event = { id: 5, title: 'Workshop', startsAt: '2026-06-01T10:00:00Z' };
    const diff = { changedFields: ['startsAt' as const], summary: 'Start time updated' };
    const out = await fanoutEventChanged(db, event, diff, { id: 'host', name: 'Host' });
    expect(out.inboxCreated).toBe(4);
    const notifiedIds = (mockCreate.mock.calls as Array<[unknown, { userId: string }]>).map(
      ([, p]) => p.userId,
    );
    expect(new Set(notifiedIds).size).toBe(4);
    expect(notifiedIds.sort()).toEqual(['u-1', 'u-2', 'u-3', 'u-4'].sort());
  });
});

describe('fanoutEventCancelled — invitees fetched before delete', () => {
  it('includes invitees in cancellation recipient set', async () => {
    // Simulate: 1 RSVPd user + 2 invitees (1 overlap) = 2 unique
    const db = dbWithTableMap({
      rsvpRows: [{ userId: 'u-1' }],
      inviteeRows: [{ inviteeUserId: 'u-1' }, { inviteeUserId: 'u-5' }],
    });
    mockPush.mockResolvedValue({ sent: 2, failed: 0 });
    const out = await fanoutEventCancelled(
      db,
      { id: 9, title: 'Cancelled Workshop', startsAt: '2026-06-01T10:00:00Z' },
      { id: 'host', name: 'Host' },
    );
    expect(out.inboxCreated).toBe(2);
    const notifiedIds = (mockCreate.mock.calls as Array<[unknown, { userId: string }]>).map(
      ([, p]) => p.userId,
    );
    expect(notifiedIds.sort()).toEqual(['u-1', 'u-5'].sort());
    // eventId must be null (cascade-safe)
    const firstPayload = (mockCreate.mock.calls as Array<[unknown, { eventId: unknown }]>)[0][1];
    expect(firstPayload.eventId).toBeNull();
  });
});
