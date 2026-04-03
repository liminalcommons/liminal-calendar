'use client';

import React, { useState, useCallback, useRef } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS_PER_DAY = 48;

interface AvailabilityGridProps {
  value: number[];          // UTC slot indices 0-335
  onChange: (slots: number[]) => void;
  timezone: string;
}

function utcSlotToLocal(utcSlot: number, tzOffsetMinutes: number): number {
  const offsetSlots = Math.round(tzOffsetMinutes / 30);
  let local = utcSlot + offsetSlots;
  if (local < 0) local += 336;
  if (local >= 336) local -= 336;
  return local;
}

function localSlotToUtc(localSlot: number, tzOffsetMinutes: number): number {
  const offsetSlots = Math.round(tzOffsetMinutes / 30);
  let utc = localSlot - offsetSlots;
  if (utc < 0) utc += 336;
  if (utc >= 336) utc -= 336;
  return utc;
}

function getTzOffset(timezone: string): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = now.toLocaleString('en-US', { timeZone: timezone });
  return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
}

function formatHour(slot: number): string {
  const h = Math.floor((slot % SLOTS_PER_DAY) / 2);
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export function AvailabilityGrid({ value, onChange, timezone }: AvailabilityGridProps) {
  const offset = getTzOffset(timezone);
  const localSet = new Set(value.map(s => utcSlotToLocal(s, offset)));

  const [painting, setPainting] = useState(false);
  const paintModeRef = useRef<'add' | 'remove'>('add');

  const toggle = useCallback((localSlot: number) => {
    const next = new Set(localSet);
    if (next.has(localSlot)) {
      next.delete(localSlot);
    } else {
      next.add(localSlot);
    }
    onChange(Array.from(next).map(s => localSlotToUtc(s, offset)));
  }, [localSet, offset, onChange]);

  const handleMouseDown = useCallback((localSlot: number) => {
    setPainting(true);
    paintModeRef.current = localSet.has(localSlot) ? 'remove' : 'add';
    toggle(localSlot);
  }, [localSet, toggle]);

  const handleMouseEnter = useCallback((localSlot: number) => {
    if (!painting) return;
    const isSet = localSet.has(localSlot);
    if (paintModeRef.current === 'add' && !isSet) toggle(localSlot);
    if (paintModeRef.current === 'remove' && isSet) toggle(localSlot);
  }, [painting, localSet, toggle]);

  const handleMouseUp = useCallback(() => setPainting(false), []);

  // Show hours 6am-11pm (slots 12-46) — most relevant range
  const visibleStart = 12; // 6 AM
  const visibleEnd = 46;   // 11 PM

  return (
    <div
      className="select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="grid gap-px" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div />
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-grove-text-muted py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="grid gap-px bg-grove-border/30 rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}
      >
        {Array.from({ length: visibleEnd - visibleStart + 1 }, (_, ri) => {
          const slotInDay = visibleStart + ri;
          const isHourBoundary = slotInDay % 2 === 0;

          return (
            <React.Fragment key={ri}>
              {/* Time label */}
              <div className={`flex items-center justify-end pr-2 text-[9px] text-grove-text-muted font-mono bg-grove-bg ${isHourBoundary ? '' : 'opacity-0'}`}
                   style={{ height: 18 }}>
                {isHourBoundary ? formatHour(slotInDay) : ''}
              </div>

              {/* Day cells */}
              {DAYS.map((_, di) => {
                const localSlot = di * SLOTS_PER_DAY + slotInDay;
                const isAvailable = localSet.has(localSlot);

                return (
                  <div
                    key={di}
                    className={`cursor-pointer transition-colors ${
                      isAvailable
                        ? 'bg-grove-green/40 hover:bg-grove-green/50'
                        : 'bg-grove-bg hover:bg-grove-border/20'
                    } ${isHourBoundary ? 'border-t border-grove-border/30' : ''}`}
                    style={{ height: 18 }}
                    onMouseDown={() => handleMouseDown(localSlot)}
                    onMouseEnter={() => handleMouseEnter(localSlot)}
                  />
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex gap-4 mt-2 text-[10px] text-grove-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-green/40" /> Available
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-grove-bg border border-grove-border/30" /> Not set
        </span>
        <span className="ml-auto">Click or drag to paint</span>
      </div>
    </div>
  );
}
