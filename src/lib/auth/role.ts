/**
 * Pure role resolution from Hylo identity signals.
 *
 * Three tiers: 'admin' | 'host' | 'member'. Plus `undefined` for users who
 * are not members of the Liminal Commons group — middleware is expected to
 * block those.
 *
 * Precedence (highest wins):
 *   1. Admin allowlist (env-configured + fallback list lives in auth.ts)
 *   2. Hylo group moderator → 'host'
 *   3. Regular group member → 'member'
 *   4. Not a group member → undefined
 */
export type Role = 'admin' | 'host' | 'member';

export interface ResolveRoleInput {
  hyloId: string;
  isLiminalCommonsMember: boolean;
  hasModeratorRole: boolean;
  adminAllowlist: string[];
}

export function resolveRole(input: ResolveRoleInput): Role | undefined {
  if (!input.isLiminalCommonsMember) return undefined;
  if (input.adminAllowlist.includes(input.hyloId)) return 'admin';
  if (input.hasModeratorRole) return 'host';
  return 'member';
}

/**
 * Session-level role resolution. Layered on top of resolveRole:
 *   1. DB override (members.role) — explicit promotions/demotions persist
 *   2. Allowlist-derived 'admin' — fallback when DB row is missing
 *   3. jwt-token role — last-known at sign-in
 *   4. 'member' — final fallback
 *
 * Exposed as a pure function so the session callback can stay thin and we
 * can test the precedence logic without spinning up NextAuth.
 */
export function resolveSessionRole(input: {
  hyloId: string | undefined;
  dbRole: string | undefined;
  tokenRole: string | undefined;
  adminAllowlist: string[];
}): string {
  if (input.dbRole) return input.dbRole;
  if (input.hyloId && input.adminAllowlist.includes(input.hyloId)) return 'admin';
  return input.tokenRole || 'member';
}
