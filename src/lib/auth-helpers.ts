// Pure helpers — no `auth` import, so this module stays client-safe.
// Server-only auth() callers should import directly from `@/auth`.

export type UserRole = 'member' | 'host' | 'admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getUserRole(session: any): UserRole {
  const role = session?.user?.role;
  if (role === 'admin') return 'admin';
  if (role === 'host') return 'host';
  return 'member';
}

export function canCreateEvents(role: UserRole): boolean {
  // All authenticated tiers may create events. Members are restricted to
  // private + ≤10 invitees, per Plan 2's capability matrix
  // (docs/superpowers/specs/2026-05-08-calendly-style-booking-design.md §2).
  // Two downstream gates enforce that: canCreatePublicEvent (rejects
  // public visibility for non-host/admin) and validateInviteeCap (rejects
  // members with >10 invitees, called inside POST /api/events before the
  // INSERT). Members may also edit + delete their own events (canEditEvent /
  // canDeleteEvent gate on creator ownership).
  return role === 'member' || role === 'host' || role === 'admin';
}

export function canCreatePublicEvent(role: UserRole): boolean {
  return role === 'host' || role === 'admin';
}

export function canPromoteMembers(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditEvent(role: UserRole, isCreator: boolean): boolean {
  // Any creator may edit their own event, regardless of tier (members included).
  // Admins may also edit events they didn't create — mirrors canDeleteEvent so
  // admins aren't limited to delete-only when a member-run event needs a fix.
  // (Product 2026-07-29: restore admin edit-any-event, previously delete-only.)
  return role === 'admin' || isCreator;
}

export function canDeleteEvent(role: UserRole, isCreator: boolean): boolean {
  // Admins may delete any event; any creator may delete their own (members
  // included). (Product 2026-05-30: members can delete their own events.)
  return role === 'admin' || isCreator;
}

export function canEditAllEvents(role: UserRole): boolean {
  return role === 'admin';
}

export function isAuthenticated(session: any): boolean {
  return !!session?.user?.role;
}
