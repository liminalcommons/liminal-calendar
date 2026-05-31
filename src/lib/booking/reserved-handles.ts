/**
 * Reserved top-level URL segments that handles MUST NOT collide with.
 *
 * The `/[handle]/[slug]` catch-all route would shadow any literal
 * directory under `src/app/` with a matching name. We keep this set
 * separate from the route file so it can be imported by tests without
 * pulling in `next/server` (which requires a Node runtime with
 * `Request`/`Response` globals).
 *
 * Keep in sync with `src/app/` top-level directories — the
 * `reserved-handles.test.ts` filesystem check fails CI otherwise.
 */
export const RESERVED_HANDLES = new Set<string>([
  'admin',
  'api',
  'book',
  'booking',
  'embed',
  'events',
  'list',
  'login',
  'logout',
  'marketplace',
  'month',
  'profile',
  'settings',
  'show-and-tell',
  'sign-in',
  'sign-up',
  'topics',
  'welcome',
]);
