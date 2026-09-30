/**
 * Shared analytics event contract — used by the public collection beacon,
 * the /guest route, and the admin dashboard.
 *
 * The write path is deliberately tiny and side-effect-free: validate a small
 * client payload, attach server-known context (guest flag), insert one row.
 * There is no auth resolution on the hot path, so a pageview beacon never
 * provisions a member or touches the session — it just records traffic.
 */

import { z } from 'zod';
import { analyticsEvents, analyticsEventsPreRef } from '@/lib/db/schema';
import { isMissingColumnError } from '@/lib/db/errors';

export const ANALYTICS_EVENT_TYPES = ['pageview', 'guest_enter', 'click'] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * Client-supplied payload. Every string is length-bounded so a buggy or
 * hostile client can't bloat a row. Only `type` is required.
 */
export const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const;

export const analyticsEventInputSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  path: z.string().max(512).optional(),
  target: z.string().max(256).optional(),
  visitorId: z.string().max(64).optional(),
  /** Host only — the client never sends a full referring URL. */
  referrer: z.string().max(128).optional(),
  device: z.enum(DEVICE_CLASSES).optional(),
  /** Per-tab visit id; groups pageviews into visits. */
  visitId: z.string().max(64).optional(),
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

const REF_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,31}$/;

/**
 * Normalise a raw `ref` value. Returns null for absent or rejected values;
 * a rejected (present but invalid) tag is logged — never stored — so a mistyped
 * link tag is debuggable from the platform logs. Truncated so a hostile value
 * can't flood the log line.
 */
export function parseRef(raw: string | null | undefined): string | null {
  const candidate = raw?.trim().toLowerCase() ?? '';
  if (!candidate) return null;
  if (REF_PATTERN.test(candidate)) return candidate;
  console.warn('[analytics] rejected ref tag:', JSON.stringify(candidate.slice(0, 64)));
  return null;
}

/**
 * Split a beaconed path into its clean path and an attribution tag. The client
 * appends `?ref=<tag>` to the landing pageview; the tag is stored in its own
 * column and stripped from `path` so per-page counts don't fragment by ref.
 * Tags are lowercased and must be short and slug-like, otherwise they're
 * dropped (null = direct/unknown) rather than storing arbitrary client text.
 */
export function splitRef(path: string | undefined): { path: string | undefined; ref: string | null } {
  if (!path) return { path, ref: null };
  const q = path.indexOf('?');
  if (q === -1) return { path, ref: null };
  const params = new URLSearchParams(path.slice(q + 1));
  const ref = parseRef(params.get('ref'));
  params.delete('ref');
  const rest = params.toString();
  return { path: path.slice(0, q) + (rest ? `?${rest}` : ''), ref };
}

/** How long to skip the ref column after an INSERT proves it isn't migrated. */
const REF_RECHECK_MS = 60_000;
let refMissingUntil = 0;

/** Test hook: forget the detected missing-column state. */
export function resetRefColumnDetection(): void {
  refMissingUntil = 0;
}

export interface RecordContext {
  /** Attribution tag parsed from the beaconed path; null = direct/unknown. */
  ref?: string | null;
  /** Whether the guest cookie was present on the request. */
  isGuest?: boolean;
  /** Canonical member id, when cheaply known. Left null on the beacon path. */
  memberId?: number | null;
  /** 'member' | 'guest' | 'anonymous', from cookie presence — no DB lookup. */
  viewer?: string | null;
  /** ISO-3166 alpha-2 resolved by the platform edge. The IP is never stored. */
  country?: string | null;
}

/**
 * Insert one analytics event. Callers treat this as fire-and-forget — the
 * collection route swallows failures so a missing table or transient DB error
 * never surfaces to a visitor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordAnalyticsEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  input: AnalyticsEventInput,
  ctx: RecordContext = {},
): Promise<void> {
  const row = {
    type: input.type,
    path: input.path ?? null,
    target: input.target ?? null,
    visitorId: input.visitorId ?? null,
    isGuest: ctx.isGuest ?? false,
    memberId: ctx.memberId ?? null,
    referrerHost: input.referrer ?? null,
    device: input.device ?? null,
    visitId: input.visitId ?? null,
    viewer: ctx.viewer ?? null,
    country: ctx.country ?? null,
  };

  // Deploy safety: boot migration runs unawaited alongside first traffic (and
  // can be skipped or fail), so the `ref` column may not exist yet. Once that
  // is detected, insert via the ref-less table shape so the event is never
  // lost. The skip window expires after a minute so a warm instance picks the
  // column up once it is migrated.
  if (Date.now() >= refMissingUntil) {
    try {
      await db.insert(analyticsEvents).values({ ...row, ref: ctx.ref ?? null });
      return;
    } catch (err) {
      if (!isMissingColumnError(err, 'ref')) throw err;
      refMissingUntil = Date.now() + REF_RECHECK_MS;
      console.warn('[analytics] analytics_events.ref missing — recording without ref until migrated');
    }
  }
  await db.insert(analyticsEventsPreRef).values(row);
}
