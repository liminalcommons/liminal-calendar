'use client';

import React, { useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

interface TimeStripProps {
  /** The selected event start time (in absolute UTC). */
  startTime: Date;
  /** Event duration in minutes — drawn as a translucent band on all rows. */
  durationMinutes?: number;
}

/** Three regions, each represented by one timezone. The strip renders one
 *  thin row per region so a host can SEE — not just read — when each region
 *  is asleep, awake, or in their working day. */
const ZONES: { id: string; label: string }[] = [
  { id: 'America/New_York',  label: 'North America' },
  { id: 'America/Sao_Paulo', label: 'South America' },
  { id: 'Europe/Madrid',     label: 'Europe' },
];

/** Hour-of-day (0–24, fractional) for a UTC date in tz. */
export function fractionalHourInZone(date: Date, tz: string): number {
  const h = parseInt(formatInTimeZone(date, tz, 'H'), 10);
  const m = parseInt(formatInTimeZone(date, tz, 'm'), 10);
  return h + m / 60;
}

/** Color for a given local hour-of-day. Used per-cell to paint each region's
 *  row, so each row reflects ITS OWN day/night state across the user's local
 *  24h x-axis. That's the key visual: at user-noon, NA might be asleep,
 *  Europe might be late-evening, and the row colors show it directly. */
function colorForHour(h: number): string {
  if (h >= 22 || h < 5)  return 'rgba(28,32,64,0.85)';     // night
  if (h >= 5 && h < 7)   return 'rgba(196,147,90,0.55)';   // dawn
  if (h >= 7 && h < 17)  return 'rgba(150,195,220,0.45)';  // day
  if (h >= 17 && h < 19) return 'rgba(196,160,90,0.55)';   // dusk
  return 'rgba(90,80,120,0.70);';                          // 19–22 evening
}

/** Build a CSS linear-gradient for one region's row by sampling its local
 *  hour at every user-local hour 0..24. Returns a `linear-gradient(...)` string. */
function buildRegionGradient(safeStart: Date, zoneId: string): string {
  const dayAnchor = new Date(safeStart);
  dayAnchor.setHours(0, 0, 0, 0);
  const stops: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const probe = new Date(dayAnchor.getTime() + i * 60 * 60_000);
    const localH = parseInt(formatInTimeZone(probe, zoneId, 'H'), 10);
    const pct = (i / 24) * 100;
    stops.push(`${colorForHour(localH).replace(/;$/, '')} ${pct}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function TimeStrip({ startTime, durationMinutes = 60 }: TimeStripProps) {
  const safeStart = startTime instanceof Date && !isNaN(startTime.getTime())
    ? startTime
    : new Date();

  const userTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }, []);

  // Cursor sits at the user's local hour-of-day (the strip's x-axis is
  // user-local), so all three rows agree on where "now" is.
  const cursorHour = fractionalHourInZone(safeStart, userTz);
  const cursorPct = (cursorHour / 24) * 100;
  const durHours = Math.min(24, Math.max(0.25, durationMinutes / 60));
  const bandWidthPct = (durHours / 24) * 100;

  const rows = useMemo(
    () => ZONES.map(z => {
      const local = formatInTimeZone(safeStart, z.id, 'h:mma').toLowerCase().replace(':00', '');
      const h = parseInt(formatInTimeZone(safeStart, z.id, 'H'), 10);
      const isUnsocial = h >= 22 || h <= 6;
      return { ...z, local, isUnsocial, gradient: buildRegionGradient(safeStart, z.id) };
    }),
    [safeStart],
  );

  // "Everyone awake" overlap — sampled at 15min on user-local axis.
  const HUMANE_START = 9, HUMANE_END = 21;
  const overlapBands = useMemo(() => {
    const STEP_MIN = 15;
    const STEPS = (24 * 60) / STEP_MIN;
    const dayAnchor = new Date(safeStart);
    dayAnchor.setHours(0, 0, 0, 0);
    const inWindow: boolean[] = [];
    for (let i = 0; i < STEPS; i++) {
      const probe = new Date(dayAnchor.getTime() + i * STEP_MIN * 60_000);
      const ok = ZONES.every(z => {
        const h = parseInt(formatInTimeZone(probe, z.id, 'H'), 10);
        return h >= HUMANE_START && h < HUMANE_END;
      });
      inWindow.push(ok);
    }
    const bands: { start: number; end: number }[] = [];
    let runStart = -1;
    for (let i = 0; i <= STEPS; i++) {
      const here = i < STEPS && inWindow[i];
      if (here && runStart < 0) runStart = i;
      if (!here && runStart >= 0) {
        bands.push({ start: (runStart * STEP_MIN) / 60, end: (i * STEP_MIN) / 60 });
        runStart = -1;
      }
    }
    return bands;
  }, [safeStart]);

  return (
    <div className="space-y-1 select-none">
      {/* Stack of region rows, each painted with that region's day/night state */}
      <div className="rounded-md border border-grove-border/40 overflow-hidden">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="relative h-5 flex items-center"
            style={{ background: row.gradient, borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Region label, drawn on the row */}
            <span className="relative z-10 px-1.5 text-[10px] font-medium text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
              {row.label}
            </span>
            <span className={`relative z-10 ml-auto px-1.5 text-[10px] font-mono drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] ${row.isUnsocial ? 'text-red-300' : 'text-white/90'}`}>
              {row.local}
            </span>

            {/* Per-row hour ticks */}
            {[6, 12, 18].map(h => (
              <div
                key={h}
                className="absolute top-0 bottom-0 border-l border-white/15"
                style={{ left: `${(h / 24) * 100}%` }}
                aria-hidden
              />
            ))}

            {/* Cursor band — drawn on each row so it visually crosses all three */}
            <div
              className="absolute top-0 bottom-0 bg-grove-accent/35 border-l-2 border-r border-grove-accent pointer-events-none"
              style={{ left: `${cursorPct}%`, width: `${bandWidthPct}%` }}
              aria-hidden
            />
          </div>
        ))}

        {/* Overlap bar — a single thin strip beneath the rows showing the
            "everyone awake" window across user-local time. */}
        <div className="relative h-2 bg-grove-border/30 border-t border-white/10">
          {overlapBands.map((b, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 bg-emerald-400/70"
              style={{
                left:  `${(b.start / 24) * 100}%`,
                width: `${((b.end - b.start) / 24) * 100}%`,
              }}
              aria-hidden
            />
          ))}
          <div
            className="absolute top-0 bottom-0 border-l-2 border-r border-grove-accent"
            style={{ left: `${cursorPct}%`, width: `${bandWidthPct}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* Compact legend with user-local axis labels */}
      <div className="flex items-center justify-between text-[9px] text-grove-text-muted px-0.5">
        <span>0</span>
        <span>6</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400/70" />
          everyone awake (your local time)
        </span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}
