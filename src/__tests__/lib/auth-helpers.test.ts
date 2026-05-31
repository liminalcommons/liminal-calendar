// Mock the auth module before importing auth-helpers
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));

import {
  getUserRole,
  canCreateEvents,
  canCreatePublicEvent,
  canPromoteMembers,
  canEditEvent,
  canDeleteEvent,
  canEditAllEvents,
  isAuthenticated,
  type UserRole,
} from '../../lib/auth-helpers';

describe('getUserRole', () => {
  // Per booking-foundation Task 3: default is now 'member', not 'host'.
  // Unauthenticated sessions are caught upstream; the member-default applies
  // to authenticated sessions whose role claim hasn't been set yet.
  it('returns member for null session (member-default policy)', () => {
    expect(getUserRole(null)).toBe('member');
  });

  it('returns member when role is undefined', () => {
    expect(getUserRole({ user: {} })).toBe('member');
  });

  it('returns correct role for each explicit value', () => {
    expect(getUserRole({ user: { role: 'host' } })).toBe('host');
    expect(getUserRole({ user: { role: 'admin' } })).toBe('admin');
    expect(getUserRole({ user: { role: 'member' } })).toBe('member');
  });
});

describe('getUserRole — member default', () => {
  it('returns member when session has no role claim', () => {
    const session = { user: { logtoUserId: '69147' } };
    expect(getUserRole(session)).toBe('member');
  });
  it('returns member explicitly when role=member', () => {
    expect(getUserRole({ user: { role: 'member' } })).toBe('member');
  });
  it('returns host when role=host', () => {
    expect(getUserRole({ user: { role: 'host' } })).toBe('host');
  });
  it('returns admin when role=admin', () => {
    expect(getUserRole({ user: { role: 'admin' } })).toBe('admin');
  });
});

describe('canCreateEvents', () => {
  it('host can create events', () => {
    expect(canCreateEvents('host')).toBe(true);
  });

  it('admin can create events', () => {
    expect(canCreateEvents('admin')).toBe(true);
  });

  it('member can create events', () => {
    expect(canCreateEvents('member')).toBe(true);
  });
});

describe('canCreateEvents — members allowed', () => {
  it('allows members', () => {
    expect(canCreateEvents('member')).toBe(true);
  });
  it('allows hosts', () => {
    expect(canCreateEvents('host')).toBe(true);
  });
  it('allows admins', () => {
    expect(canCreateEvents('admin')).toBe(true);
  });
});

describe('canCreatePublicEvent', () => {
  it('rejects members', () => { expect(canCreatePublicEvent('member')).toBe(false); });
  it('allows hosts', () => { expect(canCreatePublicEvent('host')).toBe(true); });
  it('allows admins', () => { expect(canCreatePublicEvent('admin')).toBe(true); });
});

describe('canPromoteMembers', () => {
  it('rejects members and hosts', () => {
    expect(canPromoteMembers('member')).toBe(false);
    expect(canPromoteMembers('host')).toBe(false);
  });
  it('allows admins', () => { expect(canPromoteMembers('admin')).toBe(true); });
});

describe('canEditEvent', () => {
  // Policy (2026-05-30): edit requires ownership — ANY creator may edit their own
  // event, regardless of tier. Non-creators (incl. admins) cannot edit others'
  // events. Members can now edit their own events (was restricted "until UX
  // finalized"; product confirmed enabling it).
  it('admin who is not creator cannot edit', () => {
    expect(canEditEvent('admin', false)).toBe(false);
  });

  it('admin who is creator can edit', () => {
    expect(canEditEvent('admin', true)).toBe(true);
  });

  it('host who is creator can edit', () => {
    expect(canEditEvent('host', true)).toBe(true);
  });

  it('host who is not creator cannot edit', () => {
    expect(canEditEvent('host', false)).toBe(false);
  });

  it('member who is creator CAN edit their own event', () => {
    expect(canEditEvent('member', true)).toBe(true);
  });

  it('member who is not creator cannot edit', () => {
    expect(canEditEvent('member', false)).toBe(false);
  });
});

describe('canDeleteEvent', () => {
  // Policy (2026-05-30): admins may delete any event; any creator may delete
  // their own event (members included).
  it('admin can delete any event', () => {
    expect(canDeleteEvent('admin', false)).toBe(true);
  });

  it('host who is creator can delete', () => {
    expect(canDeleteEvent('host', true)).toBe(true);
  });

  it('host who is not creator cannot delete', () => {
    expect(canDeleteEvent('host', false)).toBe(false);
  });

  it('member who is creator CAN delete their own event', () => {
    expect(canDeleteEvent('member', true)).toBe(true);
  });

  it('member who is not creator cannot delete', () => {
    expect(canDeleteEvent('member', false)).toBe(false);
  });
});

describe('canEditAllEvents', () => {
  it('admin can edit all events', () => {
    expect(canEditAllEvents('admin')).toBe(true);
  });

  it('host cannot edit all events', () => {
    expect(canEditAllEvents('host')).toBe(false);
  });

  it('member cannot edit all events', () => {
    expect(canEditAllEvents('member')).toBe(false);
  });
});

describe('isAuthenticated', () => {
  it('returns false for null session', () => {
    expect(isAuthenticated(null)).toBe(false);
  });

  it('returns false when no role present', () => {
    expect(isAuthenticated({ user: {} })).toBe(false);
  });

  it('returns true when role is present', () => {
    expect(isAuthenticated({ user: { role: 'member' } })).toBe(true);
  });
});
