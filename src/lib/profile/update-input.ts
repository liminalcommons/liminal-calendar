/**
 * Pure validation for PATCH /api/profile body.
 *
 * Accepts partial updates: only the fields that appear AND validate are
 * included in the returned `updates` object. An `updatedAt` timestamp is
 * always included so the route can write it through without branching.
 */

export type ProfileUpdates =
  | { ok: true; updates: Record<string, unknown> }
  | { ok: false; error: string };

export function validateProfileUpdate(raw: unknown): ProfileUpdates {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid JSON' };
  }
  const b = raw as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (b.timezone !== undefined) {
    if (typeof b.timezone !== 'string' || b.timezone.length === 0) {
      // Silently skip empty-string timezone — partial-update semantics.
      // (Empty-string would otherwise clobber the existing value.)
    } else {
      updates.timezone = b.timezone;
    }
  }

  if (b.availability !== undefined) {
    if (!Array.isArray(b.availability)) {
      return { ok: false, error: 'availability must be an array' };
    }
    const valid = b.availability.every(
      (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 335,
    );
    if (!valid) {
      return { ok: false, error: 'availability slots must be numbers 0-335' };
    }
    updates.availability = JSON.stringify(b.availability);
  }

  return { ok: true, updates };
}
