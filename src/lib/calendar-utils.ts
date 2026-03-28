import { format, startOfWeek, addDays, isToday, isTomorrow } from 'date-fns';
import type { DisplayEvent } from './display-event';

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Format a date as 'yyyy-MM-dd'.
 */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/**
 * Get an array of 7 Date objects starting from weekStart (Monday).
 */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Group events by date key (yyyy-MM-dd), sorted by start time within each day.
 */
export function groupEventsByDate(events: DisplayEvent[]): Map<string, DisplayEvent[]> {
  const map = new Map<string, DisplayEvent[]>();
  for (const event of events) {
    const key = toDateKey(new Date(event.starts_at));
    const existing = map.get(key) ?? [];
    existing.push(event);
    map.set(key, existing);
  }
  // Sort each day's events by start time
  for (const [key, dayEvents] of map) {
    map.set(key, dayEvents.sort((a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    ));
  }
  return map;
}

/**
 * Get upcoming events (starting from now), sorted by start time, limited to `limit` items.
 */
export function getUpcomingEvents(events: DisplayEvent[], limit = 20): DisplayEvent[] {
  const now = Date.now();
  return events
    .filter(e => new Date(e.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, limit);
}

/**
 * Format duration between two ISO strings as human-readable text.
 * Returns empty string if endAt is null/undefined.
 */
export function formatDuration(startAt: string, endAt: string | null | undefined): string {
  if (!endAt) return '';
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return '';

  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hours}h ${minutes}m`;
}

export interface DateGroup {
  label: string;
  dateKey: string;
  events: DisplayEvent[];
  isToday: boolean;
}

/**
 * Group events by date with human-readable labels ("Today", "Tomorrow", or formatted date).
 */
export function groupEventsByDateLabel(events: DisplayEvent[]): DateGroup[] {
  const grouped = groupEventsByDate(events);
  const result: DateGroup[] = [];

  // Sort keys chronologically
  const sortedKeys = Array.from(grouped.keys()).sort();

  for (const dateKey of sortedKeys) {
    const date = new Date(dateKey + 'T12:00:00'); // Use noon to avoid DST issues
    let label: string;
    if (isToday(date)) {
      label = 'Today';
    } else if (isTomorrow(date)) {
      label = 'Tomorrow';
    } else {
      label = format(date, 'EEE, MMM d');
    }

    result.push({
      label,
      dateKey,
      events: grouped.get(dateKey) ?? [],
      isToday: isToday(date),
    });
  }

  return result;
}
