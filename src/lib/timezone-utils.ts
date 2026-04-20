import { formatInTimeZone } from 'date-fns-tz';
import { useEffect, useState } from 'react';

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
 * React hook that returns the browser's timezone after hydration. During SSR
 * and the very first client render it returns 'UTC' so the server-rendered
 * HTML and the hydrated output agree; after mount, it switches to the real
 * user timezone. Callers should render time labels using this value so that
 * events display in the viewer's local time (matching Google Calendar /
 * Apple Calendar behavior).
 */
export function useUserTimezone(): string {
  const [tz, setTz] = useState<string>('UTC');
  useEffect(() => {
    setTz(getUserTimezone());
  }, []);
  return tz;
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

/**
 * Infer IANA timezone from a free-text location string (e.g. Hylo's location field).
 * Returns null if no match found.
 */
const LOCATION_TZ_MAP: [RegExp, string][] = [
  // US
  [/los angeles|la,\s*ca|santa monica|hollywood|san diego|sf\b|san francisco|oakland|berkeley|sacramento|portland|seattle|vancouver|pacific/i, 'America/Los_Angeles'],
  [/phoenix|arizona/i, 'America/Phoenix'],
  [/denver|boulder|salt lake|mountain/i, 'America/Denver'],
  [/chicago|minneapolis|dallas|austin|houston|central/i, 'America/Chicago'],
  [/new york|nyc|brooklyn|boston|philadelphia|washington|dc\b|miami|atlanta|detroit|toronto|montreal|eastern/i, 'America/New_York'],
  [/hawaii|honolulu/i, 'Pacific/Honolulu'],
  [/alaska|anchorage/i, 'America/Anchorage'],
  // South America
  [/são paulo|sao paulo|rio|brazil|brasil|buenos aires|argentina/i, 'America/Sao_Paulo'],
  [/bogota|colombia|lima|peru/i, 'America/Bogota'],
  [/santiago|chile/i, 'America/Santiago'],
  // Europe
  [/london|uk\b|united kingdom|england|scotland|wales|ireland|dublin/i, 'Europe/London'],
  [/paris|france|madrid|spain|barcelona|berlin|germany|amsterdam|netherlands|holland|brussels|belgium|rome|italy|milan|zurich|switzerland|vienna|austria|prague|czech|warsaw|poland|lisbon|portugal/i, 'Europe/Paris'],
  [/helsinki|finland|stockholm|sweden|oslo|norway|copenhagen|denmark|tallinn|estonia|riga|latvia|vilnius|lithuania/i, 'Europe/Helsinki'],
  [/athens|greece|bucharest|romania|sofia|bulgaria|istanbul|turkey|kyiv|ukraine/i, 'Europe/Athens'],
  [/moscow|russia|st\.? petersburg/i, 'Europe/Moscow'],
  // Asia
  [/dubai|abu dhabi|uae/i, 'Asia/Dubai'],
  [/mumbai|delhi|india|bangalore|chennai|kolkata|hyderabad/i, 'Asia/Kolkata'],
  [/bangkok|thailand/i, 'Asia/Bangkok'],
  [/singapore/i, 'Asia/Singapore'],
  [/hong kong/i, 'Asia/Hong_Kong'],
  [/shanghai|beijing|china/i, 'Asia/Shanghai'],
  [/tokyo|japan|osaka/i, 'Asia/Tokyo'],
  [/seoul|korea/i, 'Asia/Seoul'],
  // Oceania
  [/perth|western australia/i, 'Australia/Perth'],
  [/sydney|melbourne|brisbane|australia/i, 'Australia/Sydney'],
  [/auckland|new zealand|wellington/i, 'Pacific/Auckland'],
  // Africa
  [/cairo|egypt/i, 'Africa/Cairo'],
  [/johannesburg|south africa|cape town/i, 'Africa/Johannesburg'],
  [/lagos|nigeria|nairobi|kenya/i, 'Africa/Lagos'],
];

export function inferTimezone(location?: string | null): string {
  if (!location) return getUserTimezone();
  for (const [pattern, tz] of LOCATION_TZ_MAP) {
    if (pattern.test(location)) return tz;
  }
  return getUserTimezone();
}
