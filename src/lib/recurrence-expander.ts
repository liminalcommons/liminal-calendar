import { addDays, addWeeks, addMonths } from 'date-fns';
import type { DisplayEvent } from './display-event';

/**
 * Expand recurring events into individual instances within a date range.
 * Each instance gets a unique ID like "originalId-YYYYMMDD" so React keys work.
 * Non-recurring events pass through unchanged.
 */
export function expandRecurringEvents(
  events: DisplayEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): DisplayEvent[] {
  const result: DisplayEvent[] = [];

  for (const event of events) {
    if (!event.recurrenceRule) {
      result.push(event);
      continue;
    }

    const originalStart = new Date(event.starts_at);
    const originalEnd = event.ends_at ? new Date(event.ends_at) : null;
    const duration = originalEnd ? originalEnd.getTime() - originalStart.getTime() : 3600000;

    const advanceFn = getAdvanceFunction(event.recurrenceRule);
    if (!advanceFn) {
      // Unknown recurrence rule — just show the original
      result.push(event);
      continue;
    }

    // Generate instances from the original date forward
    let current = new Date(originalStart);
    let count = 0;
    const maxInstances = 52; // safety limit (1 year of weekly)

    while (current < rangeEnd && count < maxInstances) {
      if (current >= rangeStart || isSameDay(current, rangeStart)) {
        const instanceStart = current.toISOString();
        const instanceEnd = new Date(current.getTime() + duration).toISOString();
        const dateKey = formatDateKey(current);

        result.push({
          ...event,
          id: count === 0 ? event.id : `${event.id}-${dateKey}`,
          starts_at: instanceStart,
          ends_at: instanceEnd,
        });
      }

      current = advanceFn(current);
      count++;
    }
  }

  return result;
}

function getAdvanceFunction(rule: string): ((d: Date) => Date) | null {
  switch (rule) {
    case 'daily': return (d) => addDays(d, 1);
    case 'weekly': return (d) => addWeeks(d, 1);
    case 'fortnightly': return (d) => addWeeks(d, 2);
    case 'monthly': return (d) => addMonths(d, 1);
    default: return null;
  }
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
