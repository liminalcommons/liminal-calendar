'use client';

import React, { useMemo } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

interface TimeStripProps {
  /** The selected event start time (in absolute UTC). The strip shows what
   *  hour-of-day this lands on for each zone, and renders a vertical cursor
   *  at that position. */
  startTime: Date;
  /** Optional event duration in minutes — renders a translucent band from the
   *  cursor spanning the duration. */
  durationMinutes?: number;
}

/**
 * Six-zone day/night strip for event creation. Each row is a 24h band for one
 * timezone; bands are colored by hour-of-day so a host can instantly see
 * whether their chosen time lands in someone's working day or their 3am.
 *
 * Zones picked to cover the bulk of the user base: 3 USA zones (LA/Chicago/NY)
 * + Brazil + UK + Continental Europe (Madrid = CET, same as Paris/Berlin).
 */
const ZONES: { id: string; label: string }[] = [
  { id: 'America/Los_Angeles', label: 'LA' },
  { id: 'America/Chicago',     label: 'Chicago' },
  { id: 'America/New_York',    label: 'NY' },
  { id: 'America/Sao_Paulo',   label: 'São Paulo' },
  { id: 'Europe/London',       label: 'London' },
  { id: 'Europe/Madrid',       label: 'Madrid' },
];

/** Map an hour 0–23 to a CSS background color via a day/night gradient.
 *  Pure function so it's trivially testable. */
export function hourToBandColor(hour: number): string {
  // Night (22-5): deep indigo
  if (hour >= 22 || hour <= 4) return 'rgba(28, 32, 64, 0.85)';
  // Dawn (5-7): warm orange
  if (hour >= 5 && hour <= 7)  return 'rgba(196, 147, 90, 0.55)';
  // Morning/midday (8-16): light sky
  if (hour >= 8 && hour <= 16) return 'rgba(150, 195, 220, 0.35)';
  // Late afternoon (17-18): golden
  if (hour === 17 || hour === 18) return 'rgba(196, 160, 90, 0.50)';
  // Evening (19-21): dusky purple
  return 'rgba(90, 80, 120, 0.65)';
}

/** Returns the fractional hour (0–24) the given UTC date corresponds to in tz. */
export function fractionalHourInZone(date: Date, tz: string): number {
  const h = parseInt(formatInTimeZone(date, tz, 'H'), 10);
  const m = parseInt(formatInTimeZone(date, tz, 'm'), 10);
  return h + m / 60;
}

export function TimeStrip({ startTime, durationMinutes = 60 }: TimeStripProps) {
  const safeStart = startTime instanceof Date && !isNaN(startTime.getTime())
    ? startTime
    : new Date();

  const rows = useMemo(() => {
    return ZONES.map(z => {
      const startFrac = fractionalHourInZone(safeStart, z.id);
      const local = formatInTimeZone(safeStart, z.id, 'h:mm a');
      const dayLabel = formatInTimeZone(safeStart, z.id, 'EEE');
      const startHour = Math.floor(startFrac);
      const isUnsocial = startHour >= 22 || startHour <= 6;
      return { ...z, startFrac, local, dayLabel, isUnsocial };
    });
  }, [safeStart]);

  // 24 cells per row, one per hour
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Duration in hours, clamped to 24 so the band never wraps off-screen.
  const durHours = Math.min(24, Math.max(0.25, durationMinutes / 60));

  return (
    <div className="rounded-md border border-grove-border/50 bg-grove-border/10 p-1.5 select-none">
      <div className="text-[10px] uppercase tracking-wider text-grove-text-muted px-0.5 pb-1">
        Around the world
      </div>
      <div className="space-y-0.5">
        {rows.map(row => {
          const cursorPct = (row.startFrac / 24) * 100;
          const bandWidthPct = (durHours / 24) * 100;
          return (
            <div key={row.id} className="flex items-center gap-1.5">
              <div className="w-16 shrink-0 text-[10px] leading-none text-grove-text-muted">
                <div className="font-medium text-grove-text">{row.label}</div>
                <div className={row.isUnsocial ? 'text-red-400' : ''}>
                  {row.local}
                </div>
              </div>
              <div className="relative flex-1 h-5 rounded-sm overflow-hidden">
                {/* 24h band */}
                <div className="absolute inset-0 flex">
                  {hours.map(h => (
                    <div
                      key={h}
                      className="flex-1"
                      style={{ background: hourToBandColor(h) }}
                    />
                  ))}
                </div>
                {/* Duration band */}
                <div
                  className="absolute top-0 bottom-0 bg-grove-accent/40 border-l-2 border-r border-grove-accent"
                  style={{
                    left: `${cursorPct}%`,
                    width: `${bandWidthPct}%`,
                  }}
                  aria-hidden
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[9px] text-grove-text-muted px-[68px] pt-0.5">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}
