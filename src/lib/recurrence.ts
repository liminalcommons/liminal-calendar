/**
 * Recurrence utilities for Liminal Calendar
 * Generates future occurrence dates based on recurrence rules
 */

import { RecurrencePattern, RecurrenceRule } from './supabase';

/**
 * Generate occurrence dates based on a recurrence rule
 * @param startDate The initial event date
 * @param rule The recurrence rule
 * @param maxWeeks Maximum number of weeks to generate (default: 12)
 * @returns Array of occurrence dates
 */
export function generateOccurrences(
  startDate: Date,
  rule: RecurrenceRule,
  maxWeeks: number = 12
): Date[] {
  if (rule.pattern === 'none') {
    return [startDate];
  }

  const occurrences: Date[] = [startDate];
  const endDate = rule.endDate ? new Date(rule.endDate) : null;
  const maxDate = new Date(startDate);
  maxDate.setDate(maxDate.getDate() + maxWeeks * 7);

  const interval = rule.interval || 1;
  let currentDate = new Date(startDate);

  while (occurrences.length < 100) { // Safety limit
    currentDate = getNextOccurrence(currentDate, rule.pattern, interval, rule.daysOfWeek);

    // Stop if we've passed the end date
    if (endDate && currentDate > endDate) {
      break;
    }

    // Stop if we've passed the max weeks limit
    if (currentDate > maxDate) {
      break;
    }

    occurrences.push(new Date(currentDate));
  }

  return occurrences;
}

/**
 * Calculate the next occurrence date
 */
function getNextOccurrence(
  currentDate: Date,
  pattern: RecurrencePattern,
  interval: number,
  daysOfWeek?: number[]
): Date {
  const next = new Date(currentDate);

  switch (pattern) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;

    case 'weekly':
      next.setDate(next.getDate() + 7 * interval);
      break;

    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;

    case 'monthly':
      next.setMonth(next.getMonth() + interval);
      break;

    default:
      // For 'none' or unknown patterns, just return the same date
      break;
  }

  return next;
}

/**
 * Get a human-readable description of a recurrence rule
 */
export function getRecurrenceLabel(rule: RecurrenceRule | null | undefined): string {
  if (!rule || rule.pattern === 'none') {
    return 'Does not repeat';
  }

  const interval = rule.interval || 1;

  switch (rule.pattern) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly':
      return interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
    case 'biweekly':
      return 'Every 2 weeks';
    case 'monthly':
      return interval === 1 ? 'Monthly' : `Every ${interval} months`;
    default:
      return 'Does not repeat';
  }
}

/**
 * Recurrence options for the UI dropdown
 */
export const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Check if an event is part of a recurring series
 */
export function isRecurringEvent(event: { series_id?: string | null; recurrence_rule?: RecurrenceRule | null }): boolean {
  return !!(event.series_id || (event.recurrence_rule && event.recurrence_rule.pattern !== 'none'));
}

/**
 * Check if an event is the parent (first) of a recurring series
 */
export function isParentEvent(event: { parent_event_id?: string | null; series_id?: string | null }): boolean {
  return !!event.series_id && !event.parent_event_id;
}
