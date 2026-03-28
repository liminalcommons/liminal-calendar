'use client';

import { useState, useEffect } from 'react';
import {
  getHourInTimezone,
  getTimeOfDay,
  getTimeEmoji,
  formatTimeInTimezone,
  type TimeOfDay,
} from '@/lib/timezone-utils';

interface ClockZone {
  id: string;
  label: string;
}

const CLOCK_ZONES: ClockZone[] = [
  { id: 'America/Los_Angeles', label: 'LA' },
  { id: 'America/New_York', label: 'NYC' },
  { id: 'Europe/London', label: 'LON' },
  { id: 'Europe/Paris', label: 'CET' },
  { id: 'America/Sao_Paulo', label: 'BRA' },
];

function getTextColor(tod: TimeOfDay): string {
  switch (tod) {
    case 'day': return 'text-amber-700';
    case 'dawn': return 'text-orange-600';
    case 'dusk': return 'text-indigo-700';
    case 'night': return 'text-slate-500';
    case 'late_night': return 'text-slate-600';
  }
}

function getPillBg(tod: TimeOfDay): string {
  switch (tod) {
    case 'day': return 'bg-amber-50 border-amber-200';
    case 'dawn': return 'bg-orange-50 border-orange-200';
    case 'dusk': return 'bg-indigo-50 border-indigo-200';
    case 'night': return 'bg-slate-100 border-slate-300';
    case 'late_night': return 'bg-slate-100 border-slate-300';
  }
}

export function WorldClockStrip() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!currentTime) {
    return (
      <div className="h-8 bg-grove-surface border border-grove-border rounded-lg animate-pulse" />
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {CLOCK_ZONES.map((zone) => {
        const hour = getHourInTimezone(currentTime, zone.id);
        const tod = getTimeOfDay(hour);
        const emoji = getTimeEmoji(tod);
        const timeStr = formatTimeInTimezone(currentTime, zone.id);

        return (
          <div
            key={zone.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${getPillBg(tod)} ${getTextColor(tod)}`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="font-semibold">{zone.label}</span>
            <span className="font-mono">{timeStr}</span>
          </div>
        );
      })}
    </div>
  );
}
