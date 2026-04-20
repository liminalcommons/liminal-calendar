import { formatInTimeZone } from 'date-fns-tz';
import type { DisplayEvent } from '@/lib/display-event';

/** Width/height the popover is sized for. Extracted so tests can reason about flip thresholds. */
export const POPOVER_APPROX_HEIGHT = 420;

/**
 * Decide where to render the EventExpansion popover relative to its anchor.
 *
 * Placement rules, in order:
 *  - anchor-right + 8px gap
 *  - flip to anchor-left if the right placement would overflow the viewport
 *  - clamp left to 8px minimum (no off-screen on tight layouts)
 *  - shift up so the popover's bottom sits at viewport-8 if it would overflow
 *  - clamp top to 8px minimum
 *
 * `popoverWidth` is a parameter rather than a module constant because it is
 * derived from window width at mount (`min(360, innerWidth - 16)`) — callers
 * compute it and pass in.
 */
export function computePopoverPosition(
  anchorRect: { left: number; right: number; top: number },
  viewport: { width: number; height: number },
  popoverWidth: number,
  popoverHeight: number = POPOVER_APPROX_HEIGHT,
): { top: number; left: number } {
  let left = anchorRect.right + 8;
  let top = anchorRect.top;

  if (left + popoverWidth > viewport.width - 8) {
    left = anchorRect.left - popoverWidth - 8;
  }
  left = Math.max(8, left);

  if (top + popoverHeight > viewport.height - 8) {
    top = Math.max(8, viewport.height - popoverHeight - 8);
  }
  top = Math.max(8, top);

  return { top, left };
}

/** Human duration between two ISO timestamps. Defaults to 1h when no end. */
export function formatEventDuration(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const diffMs = end.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** "Sat Apr 20, 6:00 PM PDT" in the viewer's local timezone. */
export function formatEventDateTime(event: DisplayEvent, resolvedTimezone?: string): string {
  try {
    const tz = resolvedTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return formatInTimeZone(new Date(event.starts_at), tz, 'EEE MMM d, h:mm a zzz');
  } catch {
    return new Date(event.starts_at).toLocaleString();
  }
}

/**
 * Recurring instances carry IDs like "42-20260401" (master + YYYYMMDD).
 * Strip the suffix to get the DB row id for mutations.
 */
export function getOriginalEventId(id: string): string {
  return id.replace(/-\d{8}$/, '');
}
