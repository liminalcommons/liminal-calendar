/**
 * @jest-environment node
 *
 * PATCH /api/events/[id] — scope handling for the drag-to-reschedule flow.
 *
 * The drag UX sends `scope: 'all'` on recurring events (B4). The server's
 * existing behavior (update events.startsAt/endsAt) IS the "all" semantic,
 * because expandRecurringEvents uses the row as the template.
 *
 * What B5 adds: explicit validation that rejects unsupported scopes
 * ('this_only', 'this_and_following') as 501 Not Implemented, and rejects
 * unknown values as 400. Defense in depth — the modal disables the
 * unsupported branches client-side, but the server must not silently
 * accept them either, since "silent accept = mystery bug" if the modal
 * gating ever drifts.
 */

jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({
  getUserRole: jest.fn(() => 'host'),
  canEditEvent: jest.fn(() => true),
  canDeleteEvent: jest.fn(() => true),
}));
jest.mock('@/lib/db', () => ({
  db: { __mock: true },
}));
jest.mock('@/lib/db/to-display-event', () => ({
  dbEventToDisplayEvent: (e: unknown) => ({
    id: '42',
    starts_at: (e as { startsAt: Date }).startsAt.toISOString(),
    ends_at: (e as { endsAt: Date | null }).endsAt?.toISOString() ?? null,
    recurrenceRule: (e as { recurrenceRule: string | null }).recurrenceRule,
  }),
}));

import { auth } from '../../../auth';
import { PATCH } from '@/app/api/events/[id]/route';

const mockAuth = auth as unknown as jest.Mock;

const baseRow = {
  id: 42,
  creatorId: 'me',
  title: 'Weekly Sync',
  startsAt: new Date('2026-05-03T10:00:00Z'),
  endsAt: new Date('2026-05-03T11:00:00Z'),
  recurrenceRule: 'weekly',
};

function setupDbMocks(initialRow = baseRow) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dbModule = require('@/lib/db') as { db: Record<string, unknown> };
  let updatedRow: Record<string, unknown> = { ...initialRow };
  dbModule.db.select = () => ({
    from: () => ({
      where: () => Promise.resolve([initialRow]),
    }),
  });
  dbModule.db.update = () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => ({
        returning: () => {
          updatedRow = { ...updatedRow, ...values };
          return Promise.resolve([updatedRow]);
        },
      }),
    }),
  });
}

function makeReq(body: unknown): import('next/server').NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest;
}

const params = { params: Promise.resolve({ id: '42' }) };

describe('PATCH /api/events/[id] — scope handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { hyloId: 'me', id: 'me' } });
    setupDbMocks();
  });

  it('accepts scope="all" on recurring events and updates startsAt/endsAt', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'all',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starts_at).toBe('2026-05-03T11:00:00.000Z');
    expect(body.ends_at).toBe('2026-05-03T12:00:00.000Z');
    // Preserved — scope='all' on a recurring event must NOT clear the rule.
    expect(body.recurrenceRule).toBe('weekly');
  });

  it('rejects scope="this_only" with 501 Not Implemented', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'this_only',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/this_only|not implemented/i);
  });

  it('rejects scope="this_and_following" with 501 Not Implemented', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'this_and_following',
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(501);
  });

  it('rejects unknown scope with 400 Bad Request', async () => {
    const res = await PATCH(
      makeReq({
        scope: 'definitely_not_a_real_scope',
        startTime: '2026-05-03T11:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it('accepts requests without scope (legacy edit-form path)', async () => {
    const res = await PATCH(
      makeReq({
        startTime: '2026-05-03T11:00:00Z',
        endTime: '2026-05-03T12:00:00Z',
      }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.starts_at).toBe('2026-05-03T11:00:00.000Z');
  });
});
