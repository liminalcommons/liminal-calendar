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

  // Compute the "everyone awake" window — slice of the user's local day where
  // every zone in ZONES is between 9am and 9pm local. Sample the day at 15min
  // resolution against the event date, then collapse to contiguous intervals.
  const HUMANE_START = 9;   // 9am
  const HUMANE_END   = 21;  // 9pm (exclusive top edge — 21:00 itself counts as too late)
  const overlapBands = useMemo(() => {
    const STEP_MIN = 15;
    const STEPS = (24 * 60) / STEP_MIN; // 96
    const dayAnchor = new Date(safeStart);
    dayAnchor.setHours(0, 0, 0, 0); // user-local midnight on the event's date
    const inWindow: boolean[] = [];
    for (let i = 0; i < STEPS; i++) {
      const probe = new Date(dayAnchor.getTime() + i * STEP_MIN * 60_000);
      const ok = ZONES.every(z => {
        const h = parseInt(formatInTimeZone(probe, z.id, 'H'), 10);
        return h >= HUMANE_START && h < HUMANE_END;
      });
      inWindow.push(ok);
    }
    // Collapse to contiguous true-intervals (in 0..24 hour units).
    const bands: { start: number; end: number }[] = [];
    let runStart = -1;
    for (let i = 0; i <= STEPS; i++) {
      const here = i < STEPS && inWindow[i];
      if (here && runStart < 0) runStart = i;
      if (!here && runStart >= 0) {
        bands.push({
          start: (runStart * STEP_MIN) / 60,
          end:   (i        * STEP_MIN) / 60,
        });
        runStart = -1;
      }
    }
    return bands;
  }, [safeStart]);

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
        {/* "Everyone awake" overlap window — green band(s) where 9am ≤ local < 9pm
            in every region. Rendered under the cursor so the cursor stays visible. */}
        {overlapBands.map((b, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 bg-emerald-400/35 border-x border-emerald-300/60"
            style={{
              left:  `${(b.start / 24) * 100}%`,
              width: `${((b.end - b.start) / 24) * 100}%`,
            }}
            aria-hidden
          />
        ))}
        {/* Duration band */}
        <div
          className="absolute top-0 bottom-0 bg-grove-accent/50 border-l-2 border-r border-grove-accent"
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

      {/* One-line zone readout — with a small legend dot for the green window. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
        <span className="inline-flex items-center gap-1 text-grove-text-muted">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/70 border border-emerald-300/80" />
          everyone awake
        </span>
        <span className="text-grove-text-dim">·</span>
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
