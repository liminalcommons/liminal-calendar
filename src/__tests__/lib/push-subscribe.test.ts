import {
  validateSubscription,
  insertPushSubscription,
  deletePushSubscription,
} from '@/lib/push/subscribe';

describe('validateSubscription', () => {
  it('accepts a well-formed PushSubscription object', () => {
    const v = validateSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'KEY', auth: 'AUTH' },
    });
    expect(v).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'KEY',
      auth: 'AUTH',
    });
  });

  it('rejects null / undefined / non-objects', () => {
    expect(validateSubscription(null)).toBeNull();
    expect(validateSubscription(undefined)).toBeNull();
    expect(validateSubscription('string')).toBeNull();
    expect(validateSubscription(42)).toBeNull();
  });

  it('rejects when endpoint is missing', () => {
    expect(validateSubscription({ keys: { p256dh: 'K', auth: 'A' } })).toBeNull();
  });

  it('rejects when p256dh is missing', () => {
    expect(validateSubscription({ endpoint: 'https://x', keys: { auth: 'A' } })).toBeNull();
  });

  it('rejects when auth is missing', () => {
    expect(validateSubscription({ endpoint: 'https://x', keys: { p256dh: 'K' } })).toBeNull();
  });

  it('rejects when keys field has non-string values', () => {
    expect(
      validateSubscription({ endpoint: 'https://x', keys: { p256dh: 42, auth: 'A' } }),
    ).toBeNull();
  });
});

// Minimal fake db: records method chain arguments so we can assert on them.
function makeFakeDb() {
  const inserts: unknown[] = [];
  const deletes: Array<{ where: unknown }> = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => {
          inserts.push(v);
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: (w: unknown) => {
        deletes.push({ where: w });
        return Promise.resolve();
      },
    }),
  };
  return { db, inserts, deletes };
}

describe('insertPushSubscription', () => {
  it('inserts with the supplied userId and subscription fields', async () => {
    const { db, inserts } = makeFakeDb();
    await insertPushSubscription(db, 'user-42', {
      endpoint: 'https://x',
      p256dh: 'K',
      auth: 'A',
    });
    expect(inserts).toEqual([{ userId: 'user-42', endpoint: 'https://x', p256dh: 'K', auth: 'A' }]);
  });
});

describe('deletePushSubscription', () => {
  it('issues a delete call when no endpoint is provided (delete-all for user)', async () => {
    const { db, deletes } = makeFakeDb();
    await deletePushSubscription(db, 'user-42');
    expect(deletes).toHaveLength(1);
  });

  it('issues a delete call when an endpoint is provided', async () => {
    const { db, deletes } = makeFakeDb();
    await deletePushSubscription(db, 'user-42', 'https://x');
    expect(deletes).toHaveLength(1);
  });
});
