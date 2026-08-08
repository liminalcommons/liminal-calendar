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
import { analyticsEvents } from '@/lib/db/schema';

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

export interface RecordContext {
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
  await db.insert(analyticsEvents).values({
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
  });
}
