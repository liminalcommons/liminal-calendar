/**
 * Pure helper: pick a plausible default handle from the member's
 * existing identity (email local-part, falling back to display name).
 *
 * Output guarantees:
 *   - matches HANDLE_RE (`^[a-z0-9][a-z0-9-]{2,29}$`)
 *   - never a RESERVED_HANDLES entry
 *   - never longer than 30 chars (trailing hyphens trimmed)
 *
 * Returns null when nothing usable can be derived — caller should fall
 * back to letting the user pick manually.
 */

import { RESERVED_HANDLES } from './reserved-handles';

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max).replace(/-+$/g, '');
}

function isValid(candidate: string): boolean {
  if (!HANDLE_RE.test(candidate)) return false;
  if (RESERVED_HANDLES.has(candidate)) return false;
  return true;
}

export function suggestHandleFromMember(input: {
  email?: string | null;
  name?: string | null;
}): string | null {
  const raw: string[] = [];
  if (input.email) {
    const local = input.email.split('@')[0] ?? '';
    raw.push(local);
  }
  if (input.name) {
    raw.push(input.name);
  }
  for (const r of raw) {
    const cleaned = clip(sanitize(r), 30);
    if (cleaned.length < 3) continue;
    if (isValid(cleaned)) return cleaned;
  }
  return null;
}
