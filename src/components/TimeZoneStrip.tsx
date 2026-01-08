'use client';

import { useMemo, useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { SunRune } from './runes';
import { isGoldenHour } from '@/lib/golden-hours';

// Key timezones from West to East (Americas → Europe)
const WORLD_TIMEZONES = [
  { id: 'America/Los_Angeles', label: 'LA', offset: -8 },
  { id: 'America/Denver', label: 'DEN', offset: -7 },
  { id: 'America/Chicago', label: 'CHI', offset: -6 },
  { id: 'America/New_York', label: 'NYC', offset: -5 },
  { id: 'America/Sao_Paulo', label: 'BRA', offset: -3 },
  { id: 'Atlantic/Azores', label: 'AZO', offset: -1 },
  { id: 'Europe/London', label: 'LON', offset: 0 },
  { id: 'Europe/Paris', label: 'CET', offset: 1 },
  { id: 'Europe/Helsinki', label: 'HEL', offset: 2 },
];

// Get hour in 0-24 range for a timezone
function getHourInTimezone(date: Date, tzId: string): number {
  const hourStr = formatInTimeZone(date, tzId, 'H');
  return parseInt(hourStr, 10);
}

// Determine time-of-day category
function getTimeCategory(hour: number): 'night' | 'dawn' | 'day' | 'dusk' | 'late' {
  if (hour >= 0 && hour < 6) return 'night';      // 00:00 - 05:59 (sleeping)
  if (hour >= 6 && hour < 8) return 'dawn';       // 06:00 - 07:59 (waking up)
  if (hour >= 8 && hour < 18) return 'day';       // 08:00 - 17:59 (awake/working)
  if (hour >= 18 && hour < 21) return 'dusk';     // 18:00 - 20:59 (evening)
  return 'late';                                   // 21:00 - 23:59 (getting late)
}

// Get color for time category
function getTimeColor(category: 'night' | 'dawn' | 'day' | 'dusk' | 'late'): string {
  switch (category) {
    case 'night': return 'from-indigo-900 to-slate-900'; // Deep night
    case 'dawn': return 'from-orange-400 to-yellow-300'; // Sunrise
    case 'day': return 'from-sky-400 to-sky-300';        // Daytime
    case 'dusk': return 'from-orange-500 to-purple-600'; // Sunset
    case 'late': return 'from-purple-800 to-indigo-900'; // Late night
  }
}

// Get background color for marker
function getMarkerBg(category: 'night' | 'dawn' | 'day' | 'dusk' | 'late'): string {
  switch (category) {
    case 'night': return 'bg-indigo-900 text-indigo-200';
    case 'dawn': return 'bg-orange-400 text-orange-900';
    case 'day': return 'bg-sky-400 text-sky-900';
    case 'dusk': return 'bg-orange-500 text-orange-100';
    case 'late': return 'bg-purple-800 text-purple-200';
  }
}

// Icon for time of day
function getTimeIcon(category: 'night' | 'dawn' | 'day' | 'dusk' | 'late'): string {
  switch (category) {
    case 'night': return '🌙';
    case 'dawn': return '🌅';
    case 'day': return '☀️';
    case 'dusk': return '🌆';
    case 'late': return '🌃';
  }
}

interface TimeZoneStripProps {
  selectedTime: Date | null;
  userTimezone?: string;
  showLabels?: boolean;
}

export function TimeZoneStrip({ selectedTime, userTimezone, showLabels = true }: TimeZoneStripProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timeData = useMemo(() => {
    if (!selectedTime) return null;

    return WORLD_TIMEZONES.map((tz) => {
      const hour = getHourInTimezone(selectedTime, tz.id);
      const timeStr = formatInTimeZone(selectedTime, tz.id, 'HH:mm');
      const category = getTimeCategory(hour);

      return {
        ...tz,
        hour,
        time: timeStr,
        category,
        isUserTz: tz.id === userTimezone,
        isGolden: isGoldenHour(selectedTime),
      };
    });
  }, [selectedTime, userTimezone]);

  if (!mounted) {
    return (
      <div className="h-20 bg-stone-200 dark:bg-stone-800 rounded-lg animate-pulse" />
    );
  }

  if (!timeData) {
    return (
      <div className="p-4 bg-stone-100 dark:bg-stone-800 rounded-lg text-center text-stone-500">
        Select a time to see it across the world
      </div>
    );
  }

  // Check if it's Golden Hour
  const isGolden = timeData[0]?.isGolden;

  return (
    <div className="space-y-2">
      {/* Header */}
      {showLabels && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-cinzel font-semibold text-stone-600 dark:text-stone-400">
            Time Across The World
          </span>
          {isGolden && (
            <span className="flex items-center gap-1 text-sm text-gold-600 dark:text-gold-400">
              <SunRune size="sm" /> Golden Hour
            </span>
          )}
        </div>
      )}

      {/* Main gradient bar */}
      <div className="relative">
        {/* Background gradient representing Earth's day/night */}
        <div className="h-16 rounded-xl overflow-hidden relative">
          {/* Dynamic gradient based on actual times */}
          <div className="absolute inset-0 flex">
            {timeData.map((tz, i) => (
              <div
                key={tz.id}
                className={`flex-1 bg-gradient-to-b ${getTimeColor(tz.category)} transition-colors duration-300`}
                style={{
                  boxShadow: i > 0 ? 'inset 1px 0 0 rgba(255,255,255,0.1)' : undefined,
                }}
              />
            ))}
          </div>

          {/* Timezone markers */}
          <div className="absolute inset-0 flex">
            {timeData.map((tz) => (
              <div
                key={tz.id}
                className="flex-1 flex flex-col items-center justify-center relative group"
              >
                {/* Time display */}
                <div
                  className={`
                    px-1.5 py-0.5 rounded text-xs font-mono font-bold
                    ${tz.isUserTz ? 'ring-2 ring-gold-400 ring-offset-1 ring-offset-transparent scale-110' : ''}
                    ${getMarkerBg(tz.category)}
                    transition-transform group-hover:scale-110
                  `}
                >
                  {tz.time}
                </div>

                {/* Location label */}
                <div className={`
                  text-[10px] font-medium mt-0.5
                  ${tz.category === 'night' || tz.category === 'late' ? 'text-white/70' : 'text-black/70'}
                  ${tz.isUserTz ? 'font-bold' : ''}
                `}>
                  {tz.label}
                  {tz.isUserTz && ' •'}
                </div>

                {/* Icon indicator */}
                <div className="absolute -top-5 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  {getTimeIcon(tz.category)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend bar below */}
        <div className="flex justify-between mt-1 px-1">
          <span className="text-[10px] text-stone-500 flex items-center gap-1">
            🌙 West
          </span>
          <span className="text-[10px] text-stone-500 flex items-center gap-1">
            East ☀️
          </span>
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex flex-wrap gap-2 text-[10px] text-stone-500 dark:text-stone-400 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-400" /> Awake
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-400" /> Dawn/Dusk
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-900" /> Sleeping
        </span>
      </div>
    </div>
  );
}

// Compact version for GoldenHoursBanner (current time)
export function WorldClockStrip() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [userTz, setUserTz] = useState<string>('UTC');

  useEffect(() => {
    // Set initial time
    setCurrentTime(new Date());
    setUserTz(Intl.DateTimeFormat().resolvedOptions().timeZone);

    // Update every minute
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return <TimeZoneStrip selectedTime={currentTime} userTimezone={userTz} showLabels={false} />;
}

// Mini inline version for event cards
export function TimeZoneInline({ time, zones = ['NYC', 'CET', 'BRA'] }: { time: Date; zones?: string[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="text-xs text-stone-400">...</span>;
  }

  const zoneMap: Record<string, string> = {
    'LA': 'America/Los_Angeles',
    'NYC': 'America/New_York',
    'CET': 'Europe/Paris',
    'BRA': 'America/Sao_Paulo',
    'LON': 'Europe/London',
  };

  return (
    <span className="text-xs text-stone-500 dark:text-stone-400">
      {zones.map((z, i) => {
        const tzId = zoneMap[z] || z;
        const formatted = formatInTimeZone(time, tzId, 'HH:mm');
        const hour = parseInt(formatInTimeZone(time, tzId, 'H'), 10);
        const category = getTimeCategory(hour);
        const icon = category === 'night' || category === 'late' ? '🌙' : category === 'day' ? '☀️' : '🌅';

        return (
          <span key={z}>
            {i > 0 && ' · '}
            <span className="font-medium">{z}</span> {formatted} {icon}
          </span>
        );
      })}
    </span>
  );
}
