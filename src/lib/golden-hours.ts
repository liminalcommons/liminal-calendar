/**
 * Golden Hours - Optimal meeting times for Liminal Commons
 *
 * Based on the community-defined times:
 * - Weekdays (2 hours): Europe 20:00, Brazil 16:00, NYC 14:00, California 11:00
 * - Weekends (3 hours): Europe 18:00, Brazil 14:00, NYC 12:00, California 09:00
 *
 * These translate to UTC times:
 * - Weekdays: 19:00-21:00 UTC (when Europe is at 20:00 CET = 19:00 UTC winter, 18:00 UTC summer)
 * - Weekends: 17:00-20:00 UTC
 */

// Golden Hours configuration in UTC
export const GOLDEN_HOURS_CONFIG = {
  weekday: {
    startHour: 19, // 19:00 UTC
    durationHours: 2,
  },
  weekend: {
    startHour: 17, // 17:00 UTC
    durationHours: 3,
  },
};

// Common timezone display names
export const TIMEZONE_LABELS: Record<string, string> = {
  'Europe/Madrid': 'Spain/CET',
  'America/Sao_Paulo': 'Brazil',
  'America/New_York': 'NYC/EST',
  'America/Chicago': 'Texas/CST',
  'America/Los_Angeles': 'California/PST',
};

/**
 * Check if a given date/time falls within Golden Hours
 */
export function isGoldenHour(date: Date): boolean {
  const utcHour = date.getUTCHours();
  const dayOfWeek = date.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const config = isWeekend
    ? GOLDEN_HOURS_CONFIG.weekend
    : GOLDEN_HOURS_CONFIG.weekday;

  const endHour = config.startHour + config.durationHours;

  return utcHour >= config.startHour && utcHour < endHour;
}

/**
 * Get today's Golden Hours in a specific timezone
 */
export function getTodaysGoldenHours(timezone: string, date: Date = new Date()): {
  start: Date;
  end: Date;
  isWeekend: boolean;
} {
  const dayOfWeek = date.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const config = isWeekend
    ? GOLDEN_HOURS_CONFIG.weekend
    : GOLDEN_HOURS_CONFIG.weekday;

  // Create start time in UTC
  const start = new Date(date);
  start.setUTCHours(config.startHour, 0, 0, 0);

  // Create end time in UTC
  const end = new Date(start);
  end.setUTCHours(config.startHour + config.durationHours);

  return { start, end, isWeekend };
}

/**
 * Format a time for display in a specific timezone
 * Returns just the time portion (e.g., "2:00 PM")
 */
export function formatTimeInTimezone(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date for display in a specific timezone
 * Returns full date and time (e.g., "Dec 15, 2025 2:00 PM")
 */
export function formatDateTimeInTimezone(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get Golden Hours displayed for multiple timezones
 */
export function getGoldenHoursForAllTimezones(date: Date = new Date()): Array<{
  timezone: string;
  label: string;
  start: string;
  end: string;
}> {
  const { start, end } = getTodaysGoldenHours('UTC', date);

  const timezones = [
    'Europe/Madrid',
    'America/Sao_Paulo',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
  ];

  return timezones.map(tz => ({
    timezone: tz,
    label: TIMEZONE_LABELS[tz] || tz,
    start: formatTimeInTimezone(start, tz),
    end: formatTimeInTimezone(end, tz),
  }));
}

/**
 * Get the user's detected timezone
 */
export function getUserTimezone(): string {
  if (typeof Intl !== 'undefined') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'UTC';
}

/**
 * Calculate time until next Golden Hour
 */
export function getTimeUntilGoldenHour(date: Date = new Date()): {
  isNow: boolean;
  hoursUntil: number;
  minutesUntil: number;
  nextStart: Date;
} {
  if (isGoldenHour(date)) {
    const { start } = getTodaysGoldenHours('UTC', date);
    return {
      isNow: true,
      hoursUntil: 0,
      minutesUntil: 0,
      nextStart: start,
    };
  }

  // Find next Golden Hour
  const now = new Date(date);
  const todayGolden = getTodaysGoldenHours('UTC', now);

  let nextStart: Date;
  if (now < todayGolden.start) {
    // Golden Hour is later today
    nextStart = todayGolden.start;
  } else {
    // Golden Hour is tomorrow
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    nextStart = getTodaysGoldenHours('UTC', tomorrow).start;
  }

  const diffMs = nextStart.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const hoursUntil = Math.floor(diffMins / 60);
  const minutesUntil = diffMins % 60;

  return {
    isNow: false,
    hoursUntil,
    minutesUntil,
    nextStart,
  };
}

/**
 * Get Golden Hours configuration in UTC for a given day type
 */
export function getGoldenHoursUTC(isWeekend: boolean): { start: number; duration: number } {
  const config = isWeekend
    ? GOLDEN_HOURS_CONFIG.weekend
    : GOLDEN_HOURS_CONFIG.weekday;

  return {
    start: config.startHour,
    duration: config.durationHours,
  };
}

/**
 * Get a user-friendly description of when Golden Hour is
 */
export function getGoldenHourStatus(timezone: string): string {
  const now = new Date();
  const { isNow, hoursUntil, minutesUntil, nextStart } = getTimeUntilGoldenHour(now);

  if (isNow) {
    const { end } = getTodaysGoldenHours(timezone, now);
    const endTime = formatTimeInTimezone(end, timezone);
    return `Golden Hour is NOW! Ends at ${endTime}`;
  }

  if (hoursUntil === 0) {
    return `Golden Hour starts in ${minutesUntil} minutes`;
  }

  if (hoursUntil < 24) {
    const startTime = formatTimeInTimezone(nextStart, timezone);
    return `Next Golden Hour: Today at ${startTime}`;
  }

  const startTime = formatDateTimeInTimezone(nextStart, timezone);
  return `Next Golden Hour: ${startTime}`;
}
