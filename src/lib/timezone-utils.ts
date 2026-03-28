import { formatInTimeZone } from 'date-fns-tz';

export type TimeOfDay = 'day' | 'dawn' | 'dusk' | 'night' | 'late_night';

/**
 * Classify an hour (0-23) into a time-of-day category.
 */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 8 && hour <= 17) return 'day';
  if (hour >= 6 && hour <= 7) return 'dawn';
  if (hour >= 18 && hour <= 20) return 'dusk';
  // 21-23 or 0-5
  return 'late_night';
}

/**
 * Get an emoji for a time-of-day category.
 */
export function getTimeEmoji(tod: TimeOfDay): string {
  switch (tod) {
    case 'day': return '☀️';
    case 'dawn': return '🌅';
    case 'dusk': return '🌇';
    case 'night': return '🌙';
    case 'late_night': return '🌙';
  }
}

/**
 * Get the user's local timezone string. Falls back to 'UTC'.
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Format a date as "h:mm a" in the given timezone.
 * Example: "2:30 PM"
 */
export function formatTimeInTimezone(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'h:mm a');
}

/**
 * Format a date as "EEE, MMM d" in the given timezone.
 * Example: "Mon, Mar 28"
 */
export function formatDateInTimezone(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'EEE, MMM d');
}

/**
 * Get the hour (0-23) for a date in the given timezone.
 */
export function getHourInTimezone(date: Date, tz: string): number {
  const hourStr = formatInTimeZone(date, tz, 'H');
  return parseInt(hourStr, 10);
}

/**
 * Returns true if the date falls in late-night hours (>=22 or <=5) in ANY of the given timezones.
 */
export function isLateNightInAnyTimezone(date: Date, timezones: string[]): boolean {
  return timezones.some(tz => {
    const hour = getHourInTimezone(date, tz);
    return hour >= 22 || hour <= 5;
  });
}

export interface CommunityTimezone {
  id: string;
  label: string;
  offset: string;
}

export const COMMUNITY_TIMEZONES: CommunityTimezone[] = [
  { id: 'America/Los_Angeles', label: 'Los Angeles', offset: 'UTC-8/7' },
  { id: 'America/Denver', label: 'Denver', offset: 'UTC-7/6' },
  { id: 'America/Chicago', label: 'Chicago', offset: 'UTC-6/5' },
  { id: 'America/New_York', label: 'New York', offset: 'UTC-5/4' },
  { id: 'America/Sao_Paulo', label: 'Brazil', offset: 'UTC-3' },
  { id: 'Atlantic/Azores', label: 'Azores', offset: 'UTC-1/0' },
  { id: 'Europe/London', label: 'London', offset: 'UTC+0/1' },
  { id: 'Europe/Paris', label: 'CET', offset: 'UTC+1/2' },
  { id: 'Europe/Helsinki', label: 'Helsinki', offset: 'UTC+2/3' },
];
