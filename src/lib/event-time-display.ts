import type { DisplayEvent } from '@/lib/display-event';

export function eventToMinutes(
  event: Pick<DisplayEvent, 'starts_at' | 'ends_at'>,
): { startMinutes: number; endMinutes: number } {
  const start = new Date(event.starts_at);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  let endMinutes: number;
  if (event.ends_at) {
    const end = new Date(event.ends_at);
    endMinutes = end.getHours() * 60 + end.getMinutes();
    if (endMinutes <= startMinutes) endMinutes = 24 * 60;
  } else {
    endMinutes = startMinutes + 60;
  }
  return { startMinutes, endMinutes };
}
