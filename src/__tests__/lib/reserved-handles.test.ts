/**
 * Reserved-handles ↔ filesystem consistency.
 *
 * Task 8 of Plan 3 (1:1 Booking). The `/[handle]/[slug]` route catches
 * anything not matching a static `src/app/<dir>/` route. If a user
 * registers a handle that matches a top-level directory name, their
 * booking page would be shadowed by the static route. Worse, the
 * collision would only surface in production traffic.
 *
 * Guard: every directory under `src/app/` (except dynamic `[...]`
 * segments and route groups `(...)`) MUST appear in `RESERVED_HANDLES`.
 * This test reads the filesystem at test time so adding a new
 * top-level route without reserving its name will FAIL CI.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_HANDLES } from '@/lib/booking/reserved-handles';

const APP_DIR = join(process.cwd(), 'src', 'app');

function listTopLevelRouteSegments(): string[] {
  return readdirSync(APP_DIR)
    .filter((name) => {
      const full = join(APP_DIR, name);
      if (!statSync(full).isDirectory()) return false;
      // Skip dynamic segments and route groups — they can't be shadowed
      // by a literal handle anyway.
      if (name.startsWith('[')) return false;
      if (name.startsWith('(')) return false;
      return true;
    })
    .map((name) => name.toLowerCase());
}

describe('RESERVED_HANDLES consistency with src/app/', () => {
  test('every top-level src/app directory is reserved', () => {
    const segments = listTopLevelRouteSegments();
    expect(segments.length).toBeGreaterThan(0);
    const missing = segments.filter((s) => !RESERVED_HANDLES.has(s));
    expect(missing).toEqual([]);
  });

  test('RESERVED_HANDLES values are normalized (lowercase, no whitespace)', () => {
    for (const h of RESERVED_HANDLES) {
      expect(h).toBe(h.toLowerCase().trim());
      expect(h).not.toContain(' ');
    }
  });
});
