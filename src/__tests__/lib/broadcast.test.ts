import { computeBroadcastRecipients, BROADCAST_ENABLED } from '@/lib/notifications/broadcast';

type Event = { id: number; visibility: string; startsAt: Date };

// Minimal fake-db that supports the three call chains in computeBroadcastRecipients:
//   1. db.select({}).from(members).innerJoin(pushSubscriptions, ...).where(...)
//   2. db.select({}).from(eventMutes).where(...)
//   3. db.select({}).from(notificationLog).where(and(...))
// All chains return empty arrays — sufficient for the "private" and "no members" cases.
function makeDb() {
  return {
    select: () => ({
      from: () => ({
        // chain 1: members path — has innerJoin
        innerJoin: () => ({
          where: () => Promise.resolve([]),
        }),
        // chain 2 & 3: eventMutes / notificationLog — no join, just where
        where: () => Promise.resolve([]),
      }),
    }),
  };
}

describe('computeBroadcastRecipients', () => {
  const baseEvent: Event = { id: 42, visibility: 'public', startsAt: new Date() };

  test('returns empty for private events', async () => {
    const db = makeDb();
    const result = await computeBroadcastRecipients(db as any, { ...baseEvent, visibility: 'private' });
    expect(result).toEqual([]);
  });

  test('returns empty list when no members exist', async () => {
    const db = makeDb();
    const result = await computeBroadcastRecipients(db as any, baseEvent);
    expect(result).toEqual([]);
  });

  test('BROADCAST_ENABLED reads from process.env.BROADCAST_ENABLED', () => {
    const prev = process.env.BROADCAST_ENABLED;
    process.env.BROADCAST_ENABLED = 'true';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require('@/lib/notifications/broadcast') as typeof import('@/lib/notifications/broadcast');
    expect(fresh.BROADCAST_ENABLED).toBe(true);
    process.env.BROADCAST_ENABLED = 'false';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh2 = require('@/lib/notifications/broadcast') as typeof import('@/lib/notifications/broadcast');
    expect(fresh2.BROADCAST_ENABLED).toBe(false);
    process.env.BROADCAST_ENABLED = prev;
  });
});
