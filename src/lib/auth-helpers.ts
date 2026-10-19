// Pure helpers — no `auth` import, so this module stays client-safe.
// Server-only auth() callers should import directly from `@/auth`.

export type UserRole = 'member' | 'host' | 'admin' | 'owner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getUserRole(session: any): UserRole {
  const role = session?.user?.role;
  if (role === 'owner') return 'owner';
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
  return role === 'member' || role === 'host' || role === 'admin' || role === 'owner';
}

export function canCreatePublicEvent(role: UserRole): boolean {
  return role === 'host' || role === 'admin' || role === 'owner';
}

export function canPromoteMembers(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

/** Admins and owners — every admin API gate and admin UI affordance. */
export function isAdminLike(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

/** Hosts and above — everyone allowed to publish public events. */
export function isHostOrAbove(role: UserRole): boolean {
  return role === 'host' || role === 'admin' || role === 'owner';
}

/**
 * Who may assign which role via POST /api/admin/members/[id]/role.
 * Only owners can create admins (or owners). Admins keep everything else —
 * they can still grant/revoke member/host — minus the ability to mint admins.
 */
export function canAssignRole(callerRole: UserRole, targetRole: string): boolean {
  if (callerRole === 'owner') {
    return targetRole === 'member' || targetRole === 'host' || targetRole === 'admin' || targetRole === 'owner';
  }
  if (callerRole === 'admin') {
    return targetRole === 'member' || targetRole === 'host';
  }
  return false;
}

/**
 * Time-boxed conference publishing (Limicon): any authenticated member may
 * publish a members-visible event INTO an active conference. The window
 * closing IS the permission being taken away — nobody is promoted, so there
 * is no revert step and no risk of demoting the wrong person afterwards.
 */
export function canPublishToConference(
  role: UserRole | null | undefined,
  status: string | null | undefined,
): boolean {
  return !!role && status === 'active';
}

export function canEditEvent(role: UserRole, isCreator: boolean): boolean {
  // Any creator may edit their own event, regardless of tier (members included).
  // Admins may also edit events they didn't create — mirrors canDeleteEvent so
  // admins aren't limited to delete-only when a member-run event needs a fix.
  // (Product 2026-07-29: restore admin edit-any-event, previously delete-only.)
  // Owners inherit every admin power.
  return role === 'admin' || role === 'owner' || isCreator;
}

export function canDeleteEvent(role: UserRole, isCreator: boolean): boolean {
  // Admins may delete any event; any creator may delete their own (members
  // included). (Product 2026-05-30: members can delete their own events.)
  // Owners inherit every admin power.
  return role === 'admin' || role === 'owner' || isCreator;
}

export function canEditAllEvents(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function isAuthenticated(session: any): boolean {
  return !!session?.user?.role;
}
