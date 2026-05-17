import { revalidatePath } from 'next/cache';

/**
 * Invalidate every server-rendered view that lists or renders calendar
 * events. Call this from any route handler that mutates event-shaped data
 * (create, edit, delete, RSVP, drag-reschedule, etc.) so the landing,
 * list, and month pages reconcile on next paint instead of serving the
 * cached RSC payload until the user hits refresh.
 *
 * Routes that mutate non-calendar data (booking handle, push subscription)
 * should call `revalidatePath` directly with the paths they own.
 */
export function revalidateCalendarViews(): void {
  revalidatePath('/');
  revalidatePath('/list');
  revalidatePath('/month');
}
