'use client';

import React, { useCallback } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS_PER_DAY = 48;

// Visible range: 6am (slot 12) to 11pm (slot 46)
const VIS_START = 12;
const VIS_END = 46;

const HOUR_LABELS = ['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p'];

interface AvailabilityGridProps {
  value: number[];
  onChange: (slots: number[]) => void;
  timezone: string;
}

function getTzOffset(timezone: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: timezone });
    return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
  } catch { return 0; }
}

function localToUtc(day: number, slot: number, offsetMinutes: number): number {
  const offsetSlots = Math.round(offsetMinutes / 30);
  let utc = day * SLOTS_PER_DAY + slot - offsetSlots;
  if (utc < 0) utc += 336;
  if (utc >= 336) utc -= 336;
  return utc;
}

function utcToLocal(utcSlot: number, offsetMinutes: number): { day: number; slot: number } {
  const offsetSlots = Math.round(offsetMinutes / 30);
  let local = utcSlot + offsetSlots;
  if (local < 0) local += 336;
  if (local >= 336) local -= 336;
  return { day: Math.floor(local / SLOTS_PER_DAY), slot: local % SLOTS_PER_DAY };
}

// Build local set from UTC slots
function buildLocalSet(utcSlots: number[], offset: number): Set<string> {
  const set = new Set<string>();
  for (const s of utcSlots) {
    const { day, slot } = utcToLocal(s, offset);
    set.add(`${day}-${slot}`);
  }
  return set;
}

// Convert local set back to UTC slots
function localSetToUtc(localSet: Set<string>, offset: number): number[] {
  const utcSlots: number[] = [];
  for (const key of localSet) {
    const [d, s] = key.split('-').map(Number);
    utcSlots.push(localToUtc(d, s, offset));
  }
  return [...new Set(utcSlots)].sort((a, b) => a - b);
}

// Preset: fill days range with slot range
function fillPreset(
  current: Set<string>,
  dayStart: number, dayEnd: number,
  slotStart: number, slotEnd: number,
): Set<string> {
  const next = new Set(current);
  for (let d = dayStart; d <= dayEnd; d++) {
    for (let s = slotStart; s < slotEnd; s++) {
      next.add(`${d}-${s}`);
    }
  }
  return next;
}

function clearDays(current: Set<string>, dayStart: number, dayEnd: number): Set<string> {
  const next = new Set<string>();
  for (const key of current) {
    const d = parseInt(key.split('-')[0]);
    if (d < dayStart || d > dayEnd) next.add(key);
  }
  return next;
}

export function AvailabilityGrid({ value, onChange, timezone }: AvailabilityGridProps) {
  const offset = getTzOffset(timezone);
  const localSet = buildLocalSet(value, offset);

  const commit = useCallback((newSet: Set<string>) => {
    onChange(localSetToUtc(newSet, offset));
  }, [offset, onChange]);

  const toggleSlot = useCallback((day: number, slot: number) => {
    const key = `${day}-${slot}`;
    const next = new Set(localSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    commit(next);
  }, [localSet, commit]);

  const applyPreset = useCallback((dayStart: number, dayEnd: number, slotStart: number, slotEnd: number) => {
    const cleared = clearDays(localSet, dayStart, dayEnd);
    const filled = fillPreset(cleared, dayStart, dayEnd, slotStart, slotEnd);
    commit(filled);
  }, [localSet, commit]);

  const clearAll = useCallback(() => {
    commit(new Set());
  }, [commit]);

  // Painting state via refs (no re-render on mouse move)
  const paintingRef = React.useRef(false);
  const paintModeRef = React.useRef<'add' | 'remove'>('add');

  const handleMouseDown = useCallback((day: number, slot: number) => {
    const key = `${day}-${slot}`;
    paintingRef.current = true;
    paintModeRef.current = localSet.has(key) ? 'remove' : 'add';
    toggleSlot(day, slot);
  }, [localSet, toggleSlot]);

  const handleMouseEnter = useCallback((day: number, slot: number) => {
    if (!paintingRef.current) return;
    const key = `${day}-${slot}`;
    const isSet = localSet.has(key);
    if (paintModeRef.current === 'add' && !isSet) toggleSlot(day, slot);
    if (paintModeRef.current === 'remove' && isSet) toggleSlot(day, slot);
  }, [localSet, toggleSlot]);

  const handleMouseUp = useCallback(() => { paintingRef.current = false; }, []);

  return (
    <div onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} className="select-none">
      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-[10px] text-grove-text-muted font-medium self-center mr-1">Quick fill:</span>
        <button onClick={() => applyPreset(0, 4, 18, 34)} className="text-[10px] px-2.5 py-1 rounded-full border border-grove-border text-grove-text-muted hover:text-grove-text hover:bg-grove-border/20 transition-colors">
          Weekdays 9am-5pm
        </button>
        <button onClick={() => applyPreset(0, 4, 24, 36)} className="text-[10px] px-2.5 py-1 rounded-full border border-grove-border text-grove-text-muted hover:text-grove-text hover:bg-grove-border/20 transition-colors">
          Weekdays 12-6pm
        </button>
        <button onClick={() => applyPreset(5, 6, 20, 28)} className="text-[10px] px-2.5 py-1 rounded-full border border-grove-border text-grove-text-muted hover:text-grove-text hover:bg-grove-border/20 transition-colors">
          Weekends 10am-2pm
        </button>
        <button onClick={() => applyPreset(0, 6, 14, 46)} className="text-[10px] px-2.5 py-1 rounded-full border border-grove-border text-grove-text-muted hover:text-grove-text hover:bg-grove-border/20 transition-colors">
          All days 7am-11pm
        </button>
        <button onClick={clearAll} className="text-[10px] px-2.5 py-1 rounded-full border border-red-800/30 text-red-400 hover:bg-red-900/20 transition-colors">
          Clear all
        </button>
      </div>

      {/* Hour labels */}
      <div className="flex mb-0.5" style={{ paddingLeft: 36 }}>
        {HOUR_LABELS.map((label, i) => (
          <div key={i} className="text-[8px] text-grove-text-dim" style={{ width: `${100 / HOUR_LABELS.length}%` }}>
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="space-y-0.5">
        {DAYS.map((dayLabel, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1">
            <span className="w-8 text-[10px] text-grove-text-muted font-medium text-right shrink-0">
              {dayLabel}
            </span>
            <div className="flex-1 flex h-5 rounded-sm overflow-hidden bg-grove-border/15">
              {Array.from({ length: VIS_END - VIS_START }, (_, si) => {
                const slot = VIS_START + si;
                const key = `${dayIdx}-${slot}`;
                const isAvailable = localSet.has(key);
                const isHourBoundary = slot % 2 === 0;

                return (
                  <div
                    key={si}
                    className={`flex-1 cursor-pointer transition-colors ${
                      isAvailable
                        ? 'bg-grove-green/50 hover:bg-grove-green/70'
                        : 'hover:bg-grove-border/30'
                    } ${isHourBoundary && si > 0 ? 'border-l border-grove-border/20' : ''}`}
                    onMouseDown={() => handleMouseDown(dayIdx, slot)}
                    onMouseEnter={() => handleMouseEnter(dayIdx, slot)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-grove-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-green/50" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-border/15 border border-grove-border/30" /> Not set
        </span>
        <span className="ml-auto">Click or drag to toggle</span>
      </div>
    </div>
  );
}
