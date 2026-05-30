/**
 * @jest-environment node
 */
import { syncLogtoMemberOnRead } from '@/lib/auth/sync-logto-member-on-read';

function makeDb(emailRows: unknown[] = []) {
  const whereAfterSet = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: whereAfterSet });
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const db = {
    select: jest.fn().mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(emailRows) }) }),
    }),
    update: jest.fn().mockReturnValue({ set: updateSet }),
    insert: jest.fn().mockReturnValue({ values: insertValues }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { db, updateSet, insertValues };
}

describe('syncLogtoMemberOnRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links logtoId onto an existing email-matched row that lacks one', async () => {
    const { db, updateSet, insertValues } = makeDb([{ id: 5, email: 'a@b.com', logtoId: null }]);

    await syncLogtoMemberOnRead(db, { logtoUserId: 'L1', email: 'a@b.com', name: 'A' });

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ logtoId: 'L1' }));
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('does not touch a row that already has a logtoId', async () => {
    const { db, updateSet, insertValues } = makeDb([{ id: 5, email: 'a@b.com', logtoId: 'L_existing' }]);

    await syncLogtoMemberOnRead(db, { logtoUserId: 'L1', email: 'a@b.com', name: 'A' });

    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('creates a new member (email lowercased) when nothing matches', async () => {
    const { db, insertValues } = makeDb([]);

    await syncLogtoMemberOnRead(db, { logtoUserId: 'L2', email: 'New@Example.com', name: 'New User' });

    expect(insertValues).toHaveBeenCalledWith({ logtoId: 'L2', email: 'new@example.com', name: 'New User' });
  });

  it('falls back to the email local-part when name is blank', async () => {
    const { db, insertValues } = makeDb([]);

    await syncLogtoMemberOnRead(db, { logtoUserId: 'L3', email: 'jane@x.com', name: '   ' });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: 'jane' }));
  });

  it('creates a Member with email:null and name:"Member" when no email claim', async () => {
    const { db, insertValues } = makeDb([]);

    await syncLogtoMemberOnRead(db, { logtoUserId: 'L4', email: null, name: null });

    // No email → no lookup, straight to insert with safe defaults.
    expect(db.select).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith({ logtoId: 'L4', email: null, name: 'Member' });
  });

  it('swallows DB errors so read paths never crash', async () => {
    const db = {
      select: () => {
        throw new Error('boom');
      },
      update: jest.fn(),
      insert: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      syncLogtoMemberOnRead(db, { logtoUserId: 'L5', email: 'e@x.com' }),
    ).resolves.toBeUndefined();
  });
});
