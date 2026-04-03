'use client';

import React, { useCallback } from 'react';
import { Plus, X, Clock } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS_PER_DAY = 48;

// Generate time options: "12:00 AM", "12:30 AM", ..., "11:30 PM"
const TIME_OPTIONS: { label: string; slot: number }[] = [];
for (let s = 0; s < SLOTS_PER_DAY; s++) {
  const h = Math.floor(s / 2);
  const m = (s % 2) * 30;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  TIME_OPTIONS.push({ label, slot: s });
}

interface TimeRange {
  from: number; // slot within day 0-47
  to: number;   // slot within day 0-47
}

interface AvailabilityGridProps {
  value: number[];          // UTC slot indices 0-335
  onChange: (slots: number[]) => void;
  timezone: string;
}

function getTzOffset(timezone: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
  } catch {
    return 0;
  }
}

function utcSlotToLocal(utcSlot: number, offsetMinutes: number): { day: number; slot: number } {
  const offsetSlots = Math.round(offsetMinutes / 30);
  let local = utcSlot + offsetSlots;
  if (local < 0) local += 336;
  if (local >= 336) local -= 336;
  return { day: Math.floor(local / SLOTS_PER_DAY), slot: local % SLOTS_PER_DAY };
}

function localToUtcSlot(day: number, slot: number, offsetMinutes: number): number {
  const offsetSlots = Math.round(offsetMinutes / 30);
  let utc = day * SLOTS_PER_DAY + slot - offsetSlots;
  if (utc < 0) utc += 336;
  if (utc >= 336) utc -= 336;
  return utc;
}

// Convert flat UTC slot array → per-day time ranges in local time
function slotsToRanges(utcSlots: number[], offsetMinutes: number): TimeRange[][] {
  const daySlots: Set<number>[] = Array.from({ length: 7 }, () => new Set());

  for (const utcSlot of utcSlots) {
    const { day, slot } = utcSlotToLocal(utcSlot, offsetMinutes);
    daySlots[day].add(slot);
  }

  return daySlots.map(slots => {
    if (slots.size === 0) return [];
    const sorted = Array.from(slots).sort((a, b) => a - b);
    const ranges: TimeRange[] = [];
    let from = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
      } else {
        ranges.push({ from, to: prev + 1 });
        from = sorted[i];
        prev = sorted[i];
      }
    }
    ranges.push({ from, to: Math.min(prev + 1, SLOTS_PER_DAY) });
    return ranges;
  });
}

// Convert per-day time ranges → flat UTC slot array
function rangesToSlots(dayRanges: TimeRange[][], offsetMinutes: number): number[] {
  const slots: number[] = [];
  for (let day = 0; day < 7; day++) {
    for (const range of dayRanges[day]) {
      for (let s = range.from; s < range.to; s++) {
        slots.push(localToUtcSlot(day, s, offsetMinutes));
      }
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

export function AvailabilityGrid({ value, onChange, timezone }: AvailabilityGridProps) {
  const offset = getTzOffset(timezone);
  const dayRanges = slotsToRanges(value, offset);

  const updateRanges = useCallback((newRanges: TimeRange[][]) => {
    onChange(rangesToSlots(newRanges, offset));
  }, [offset, onChange]);

  const addRange = useCallback((day: number) => {
    const newRanges = dayRanges.map((r, i) => i === day ? [...r, { from: 18, to: 24 }] : [...r]); // default 9am-12pm
    updateRanges(newRanges);
  }, [dayRanges, updateRanges]);

  const removeRange = useCallback((day: number, rangeIdx: number) => {
    const newRanges = dayRanges.map((r, i) =>
      i === day ? r.filter((_, ri) => ri !== rangeIdx) : [...r]
    );
    updateRanges(newRanges);
  }, [dayRanges, updateRanges]);

  const updateRange = useCallback((day: number, rangeIdx: number, field: 'from' | 'to', slot: number) => {
    const newRanges = dayRanges.map((r, i) => {
      if (i !== day) return [...r];
      return r.map((range, ri) => {
        if (ri !== rangeIdx) return range;
        if (field === 'from') return { from: slot, to: Math.max(slot + 1, range.to) };
        return { from: range.from, to: Math.max(slot, range.from + 1) };
      });
    });
    updateRanges(newRanges);
  }, [dayRanges, updateRanges]);

  return (
    <div className="space-y-3">
      {DAYS.map((dayName, dayIdx) => {
        const ranges = dayRanges[dayIdx];
        const hasRanges = ranges.length > 0;

        return (
          <div
            key={dayIdx}
            className={`rounded-xl border p-4 transition-colors ${
              hasRanges
                ? 'bg-grove-surface border-grove-green/30'
                : 'bg-grove-bg border-grove-border/50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${hasRanges ? 'text-grove-text' : 'text-grove-text-muted'}`}>
                  {dayName}
                </span>
                <span className="text-[10px] text-grove-text-muted">{DAY_SHORT[dayIdx]}</span>
                {hasRanges && (
                  <span className="text-[10px] bg-grove-green/20 text-grove-green px-1.5 py-0.5 rounded-full">
                    {ranges.length} {ranges.length === 1 ? 'window' : 'windows'}
                  </span>
                )}
              </div>
              <button
                onClick={() => addRange(dayIdx)}
                className="flex items-center gap-1 text-xs text-grove-accent-deep hover:text-grove-accent transition-colors"
              >
                <Plus size={12} /> Add
              </button>
            </div>

            {ranges.length === 0 ? (
              <p className="text-xs text-grove-text-dim italic">Not available</p>
            ) : (
              <div className="space-y-2">
                {ranges.map((range, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <Clock size={14} className="text-grove-green shrink-0" />
                    <select
                      value={range.from}
                      onChange={e => updateRange(dayIdx, ri, 'from', Number(e.target.value))}
                      className="text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                                 text-grove-text font-medium focus:outline-none focus:ring-1 focus:ring-grove-accent
                                 cursor-pointer min-w-[130px]"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={t.slot} value={t.slot} className="bg-grove-surface text-grove-text">
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-grove-text-muted font-medium">to</span>
                    <select
                      value={range.to}
                      onChange={e => updateRange(dayIdx, ri, 'to', Number(e.target.value))}
                      className="text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2
                                 text-grove-text font-medium focus:outline-none focus:ring-1 focus:ring-grove-accent
                                 cursor-pointer min-w-[130px]"
                    >
                      {TIME_OPTIONS.filter(t => t.slot > range.from).map(t => (
                        <option key={t.slot} value={t.slot} className="bg-grove-surface text-grove-text">
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRange(dayIdx, ri)}
                      className="p-1 rounded text-grove-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
