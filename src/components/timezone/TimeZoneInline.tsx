'use client';

import { useState, useEffect } from 'react';
import {
  COMMUNITY_TIMEZONES,
  getHourInTimezone,
  getTimeOfDay,
  getTimeEmoji,
  formatTimeInTimezone,
} from '@/lib/timezone-utils';

// Map short abbreviations to IANA IDs from COMMUNITY_TIMEZONES
const ABBREV_TO_IANA: Record<string, string> = Object.fromEntries(
  COMMUNITY_TIMEZONES.map((tz) => {
    // Build abbreviation from label: first 3 chars uppercase, or known mappings
    const abbrevMap: Record<string, string> = {
      'Los Angeles': 'LA',
      'Denver': 'DEN',
      'Chicago': 'CHI',
      'New York': 'NYC',
      'Brazil': 'BRA',
      'Azores': 'AZO',
      'London': 'LON',
      'CET': 'CET',
      'Helsinki': 'HEL',
    };
    const abbrev = abbrevMap[tz.label] ?? tz.label.slice(0, 3).toUpperCase();
    return [abbrev, tz.id];
  })
);

interface TimeZoneInlineProps {
  time: Date;
  zones?: string[];
}

export function TimeZoneInline({ time, zones = ['NYC', 'CET', 'BRA'] }: TimeZoneInlineProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="text-xs text-grove-text-muted">...</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {zones.map((abbrev, i) => {
        const tzId = ABBREV_TO_IANA[abbrev] ?? abbrev;
        const hour = getHourInTimezone(time, tzId);
        const tod = getTimeOfDay(hour);
        const emoji = getTimeEmoji(tod);
        const timeStr = formatTimeInTimezone(time, tzId);

        return (
          <span key={abbrev} className="inline-flex items-center gap-0.5">
            {i > 0 && <span className="text-grove-border mx-0.5">·</span>}
            <span className="text-[10px] leading-none">{emoji}</span>
            <span className="text-xs font-semibold text-grove-text">{abbrev}</span>
            <span className="text-xs font-mono text-grove-text-muted">{timeStr}</span>
          </span>
        );
      })}
    </span>
  );
}
