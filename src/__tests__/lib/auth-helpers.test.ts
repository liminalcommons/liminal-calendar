// Mock the auth module before importing auth-helpers
jest.mock('../../../auth', () => ({
  auth: jest.fn(),
}));

import {
  getUserRole,
  canCreateEvents,
  canEditEvent,
  canDeleteEvent,
  canEditAllEvents,
  isAuthenticated,
  type UserRole,
} from '../../lib/auth-helpers';

describe('getUserRole', () => {
  it('returns member for null session', () => {
    expect(getUserRole(null)).toBe('member');
  });

  it('returns member when role is undefined', () => {
    expect(getUserRole({ user: {} })).toBe('member');
  });

  it('returns role from session', () => {
    expect(getUserRole({ user: { role: 'host' } })).toBe('host');
    expect(getUserRole({ user: { role: 'admin' } })).toBe('admin');
    expect(getUserRole({ user: { role: 'member' } })).toBe('member');
  });
});

describe('canCreateEvents', () => {
  it('host can create events', () => {
    expect(canCreateEvents('host')).toBe(true);
  });

  it('admin can create events', () => {
    expect(canCreateEvents('admin')).toBe(true);
  });

  it('member cannot create events', () => {
    expect(canCreateEvents('member')).toBe(false);
  });
});

describe('canEditEvent', () => {
  it('admin can edit even when not creator', () => {
    expect(canEditEvent('admin', false)).toBe(true);
  });

  it('host who is creator can edit', () => {
    expect(canEditEvent('host', true)).toBe(true);
  });

  it('host who is not creator cannot edit', () => {
    expect(canEditEvent('host', false)).toBe(false);
  });

  it('member who is creator cannot edit', () => {
    expect(canEditEvent('member', true)).toBe(false);
  });
});

describe('canDeleteEvent', () => {
  it('admin can delete', () => {
    expect(canDeleteEvent('admin', false)).toBe(true);
  });

  it('host who is creator can delete', () => {
    expect(canDeleteEvent('host', true)).toBe(true);
  });

  it('member cannot delete', () => {
    expect(canDeleteEvent('member', true)).toBe(false);
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
