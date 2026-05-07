'use client';

import React, { useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

interface TimeStripProps {
  /** The selected event start time (in absolute UTC). */
  startTime: Date;
  /** Event duration in minutes — drawn as a translucent band on the strip. */
  durationMinutes?: number;
}

/** Three regional zones — one representative timezone per region. */
const ZONES: { id: string; label: string }[] = [
  { id: 'America/New_York',  label: 'North America' },
  { id: 'America/Sao_Paulo', label: 'South America' },
  { id: 'Europe/Madrid',     label: 'Europe' },
];

/** Single 24h day/night gradient — used as the background of the one strip. */
const STRIP_GRADIENT =
  'linear-gradient(to right, ' +
  'rgba(28,32,64,0.85) 0%, ' +     // 0h — night
  'rgba(28,32,64,0.85) 20%, ' +    // 5h
  'rgba(196,147,90,0.55) 25%, ' +  // 6h dawn
  'rgba(150,195,220,0.40) 33%, ' + // 8h morning
  'rgba(150,195,220,0.40) 67%, ' + // 16h
  'rgba(196,160,90,0.55) 75%, ' +  // 18h dusk
  'rgba(90,80,120,0.70) 87%, ' +   // 21h evening
  'rgba(28,32,64,0.85) 100%)';     // 24h night

/** Hour-of-day (0–24, fractional) for a UTC date in tz. */
export function fractionalHourInZone(date: Date, tz: string): number {
  const h = parseInt(formatInTimeZone(date, tz, 'H'), 10);
  const m = parseInt(formatInTimeZone(date, tz, 'm'), 10);
  return h + m / 60;
}

export function TimeStrip({ startTime, durationMinutes = 60 }: TimeStripProps) {
  const safeStart = startTime instanceof Date && !isNaN(startTime.getTime())
    ? startTime
    : new Date();

  const userTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }, []);

  // Position the cursor according to the user's own local hour-of-day, so the
  // strip reads as "where in MY day this lands". Zone labels then show what
  // each city sees at that same instant.
  const cursorHour = fractionalHourInZone(safeStart, userTz);
  const cursorPct = (cursorHour / 24) * 100;
  const durHours = Math.min(24, Math.max(0.25, durationMinutes / 60));
  const bandWidthPct = (durHours / 24) * 100;

  const zoneLabels = useMemo(
    () => ZONES.map(z => {
      const local = formatInTimeZone(safeStart, z.id, 'h:mma').toLowerCase().replace(':00', '');
      const h = parseInt(formatInTimeZone(safeStart, z.id, 'H'), 10);
      const isUnsocial = h >= 22 || h <= 6;
      return { ...z, local, isUnsocial };
    }),
    [safeStart],
  );

  return (
    <div className="space-y-1 select-none">
      {/* The single strip */}
      <div
        className="relative h-6 rounded-sm overflow-hidden border border-grove-border/40"
        style={{ background: STRIP_GRADIENT }}
        aria-label="24-hour day/night strip with selected event window"
      >
        {/* Duration band */}
        <div
          className="absolute top-0 bottom-0 bg-grove-accent/40 border-l-2 border-r border-grove-accent"
          style={{ left: `${cursorPct}%`, width: `${bandWidthPct}%` }}
          aria-hidden
        />
        {/* Hour ticks at 6/12/18 */}
        {[6, 12, 18].map(h => (
          <div
            key={h}
            className="absolute top-0 bottom-0 border-l border-white/15"
            style={{ left: `${(h / 24) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>

      {/* One-line zone readout */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
        {zoneLabels.map(z => (
          <span
            key={z.id}
            className={z.isUnsocial ? 'text-red-400' : 'text-grove-text-muted'}
          >
            <span className="font-medium text-grove-text">{z.label}</span>{' '}
            {z.local}
          </span>
        ))}
      </div>
    </div>
  );
}
