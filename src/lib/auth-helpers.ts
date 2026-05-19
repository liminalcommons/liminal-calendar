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
  // INSERT). Edit + delete of member-created events remain restricted
  // until UX for those flows is finalized.
  return role === 'member' || role === 'host' || role === 'admin';
}

export function canCreatePublicEvent(role: UserRole): boolean {
  return role === 'host' || role === 'admin';
}

export function canPromoteMembers(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditEvent(role: UserRole, isCreator: boolean): boolean {
  // Only the creator can edit — admins can delete but not edit others' events
  if (isCreator && (role === 'host' || role === 'admin')) return true;
  return false;
}

export function canDeleteEvent(role: UserRole, isCreator: boolean): boolean {
  if (role === 'admin') return true;
  if (role === 'host' && isCreator) return true;
  return false;
}

export function canEditAllEvents(role: UserRole): boolean {
  return role === 'admin';
}

export function isAuthenticated(session: any): boolean {
  return !!session?.user?.role;
}
