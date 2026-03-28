'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  COMMUNITY_TIMEZONES,
  getTimeOfDay,
  getTimeEmoji,
  getHourInTimezone,
  formatTimeInTimezone,
  isLateNightInAnyTimezone,
  type TimeOfDay,
} from '@/lib/timezone-utils';

interface TimeZoneStripProps {
  selectedTime: Date | null;
  userTimezone?: string;
  showLabels?: boolean;
}

function getTimeOfDayBgGradient(tod: TimeOfDay): string {
  switch (tod) {
    case 'day': return 'from-amber-100 to-amber-50';
    case 'dawn': return 'from-orange-200 to-orange-50';
    case 'dusk': return 'from-indigo-200 to-purple-100';
    case 'night': return 'from-slate-300 to-slate-200';
    case 'late_night': return 'from-slate-400 to-slate-300';
  }
}

function getTextColor(tod: TimeOfDay): string {
  switch (tod) {
    case 'day': return 'text-amber-800';
    case 'dawn': return 'text-orange-800';
    case 'dusk': return 'text-indigo-800';
    case 'night': return 'text-slate-600';
    case 'late_night': return 'text-slate-700';
  }
}

export function TimeZoneStrip({ selectedTime, userTimezone, showLabels = true }: TimeZoneStripProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timeData = useMemo(() => {
    if (!selectedTime) return null;

    return COMMUNITY_TIMEZONES.map((tz) => {
      const hour = getHourInTimezone(selectedTime, tz.id);
      const tod = getTimeOfDay(hour);
      const timeStr = formatTimeInTimezone(selectedTime, tz.id);
      const emoji = getTimeEmoji(tod);

      return {
        ...tz,
        hour,
        tod,
        timeStr,
        emoji,
        isUserTz: tz.id === userTimezone,
      };
    });
  }, [selectedTime, userTimezone]);

  if (!mounted) {
    return (
      <div className="h-20 bg-grove-surface border border-grove-border rounded-lg animate-pulse" />
    );
  }

  if (!timeData) {
    return (
      <div className="p-4 bg-grove-surface border border-grove-border rounded-lg text-center text-grove-text-muted text-sm">
        Select a time to see it across the world
      </div>
    );
  }

  const communityTzIds = COMMUNITY_TIMEZONES.map((tz) => tz.id);
  const lateNightWarning =
    selectedTime != null && isLateNightInAnyTimezone(selectedTime, communityTzIds);

  return (
    <div className="space-y-2">
      {showLabels && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-grove-text">
            Time Across The World
          </span>
          {lateNightWarning && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              🌙 Late night for some community members
            </span>
          )}
        </div>
      )}

      <div className="bg-grove-surface border border-grove-border rounded-lg overflow-hidden">
        <div className="flex">
          {timeData.map((tz, i) => (
            <div
              key={tz.id}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 px-0.5
                bg-gradient-to-b ${getTimeOfDayBgGradient(tz.tod)}
                ${i > 0 ? 'border-l border-grove-border/50' : ''}
                ${tz.isUserTz ? 'ring-2 ring-inset ring-grove-accent' : ''}
                transition-colors
              `}
            >
              <span className="text-base leading-none">{tz.emoji}</span>
              <span
                className={`text-[10px] font-mono font-bold mt-1 leading-none ${getTextColor(tz.tod)}`}
              >
                {tz.timeStr}
              </span>
              <span
                className={`text-[9px] mt-0.5 leading-none ${tz.isUserTz ? 'font-bold text-grove-accent' : 'text-grove-text-muted'}`}
              >
                {tz.label.length > 6 ? tz.label.slice(0, 5) + '…' : tz.label}
                {tz.isUserTz && ' ●'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showLabels && (
        <div className="flex justify-between px-1">
          <span className="text-[10px] text-grove-text-muted">← West</span>
          <span className="text-[10px] text-grove-text-muted">East →</span>
        </div>
      )}
    </div>
  );
}
