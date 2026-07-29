'use client';

import { useState } from 'react';

// A plain string, not a closed union: 'none' | 'daily' | 'weekly' | 'fortnightly'
// | 'monthly' | `every_${number}_weeks` | `monthly_${1|2|3|4|-1}_${weekday}`.
// See src/lib/recurrence-expander.ts for the parser/encoder this must match.
export type RecurrenceValue = string;
export type RecurrenceEndType = 'never' | 'on_date' | 'after_count';

interface RecurrenceSelectorProps {
  value: RecurrenceValue;
  onChange: (value: RecurrenceValue, endType?: RecurrenceEndType, endDate?: string, endCount?: number) => void;
}

type SelectorMode = 'none' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'every_n_weeks' | 'monthly_nth_weekday';

const MODE_OPTIONS: { value: SelectorMode; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'every_n_weeks', label: 'Every N weeks…' },
  { value: 'monthly', label: 'Monthly (same date)' },
  { value: 'monthly_nth_weekday', label: 'Monthly on a weekday…' },
];

const WEEKDAYS: { value: string; label: string }[] = [
  { value: 'sun', label: 'Sunday' },
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
];

const POSITIONS: { value: number; label: string }[] = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: -1, label: 'Last' },
];

/** Parse an encoded rule string into the selector's UI mode + sub-params. */
function decode(value: RecurrenceValue): { mode: SelectorMode; weeks: number; pos: number; weekday: string } {
  const defaults = { weeks: 4, pos: -1, weekday: 'thu' };
  if (value === 'none' || value === 'daily' || value === 'weekly' || value === 'fortnightly' || value === 'monthly') {
    return { mode: value, ...defaults };
  }
  const everyWeeks = value.match(/^every_(\d+)_weeks$/);
  if (everyWeeks) {
    return { mode: 'every_n_weeks', ...defaults, weeks: parseInt(everyWeeks[1], 10) };
  }
  const monthlyWeekday = value.match(/^monthly_(-?\d+)_([a-z]{3})$/);
  if (monthlyWeekday) {
    return { mode: 'monthly_nth_weekday', ...defaults, pos: parseInt(monthlyWeekday[1], 10), weekday: monthlyWeekday[2] };
  }
  return { mode: 'none', ...defaults };
}

export function RecurrenceSelector({ value, onChange }: RecurrenceSelectorProps) {
  // Frequency + sub-params are derived from `value` on every render (fully
  // controlled by the parent) rather than mirrored into local state — the
  // parent may set `value` asynchronously (e.g. after fetching an event to
  // edit), and a one-shot useState seed would go stale when that happens.
  const { mode, weeks, pos: monthlyPos, weekday: monthlyWeekday } = decode(value);
  const [endType, setEndType] = useState<RecurrenceEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [endCount, setEndCount] = useState(12);

  function encode(m: SelectorMode, w: number, pos: number, weekday: string): RecurrenceValue {
    if (m === 'every_n_weeks') return `every_${Math.max(1, w)}_weeks`;
    if (m === 'monthly_nth_weekday') return `monthly_${pos}_${weekday}`;
    return m;
  }

  function emit(m: SelectorMode, w: number, pos: number, weekday: string, et: RecurrenceEndType) {
    if (m === 'none') {
      onChange('none');
      return;
    }
    onChange(
      encode(m, w, pos, weekday),
      et,
      et === 'on_date' ? (endDate || undefined) : undefined,
      et === 'after_count' ? endCount : undefined,
    );
  }

  const handleModeChange = (newMode: SelectorMode) => {
    emit(newMode, weeks, monthlyPos, monthlyWeekday, endType);
  };

  const handleWeeksChange = (newWeeks: number) => {
    emit(mode, newWeeks, monthlyPos, monthlyWeekday, endType);
  };

  const handleMonthlyPosChange = (newPos: number) => {
    emit(mode, weeks, newPos, monthlyWeekday, endType);
  };

  const handleMonthlyWeekdayChange = (newWeekday: string) => {
    emit(mode, weeks, monthlyPos, newWeekday, endType);
  };

  const handleEndTypeChange = (newEndType: RecurrenceEndType) => {
    setEndType(newEndType);
    if (mode !== 'none') {
      onChange(
        encode(mode, weeks, monthlyPos, monthlyWeekday),
        newEndType,
        newEndType === 'on_date' ? endDate : undefined,
        newEndType === 'after_count' ? endCount : undefined,
      );
    }
  };

  const handleEndDateChange = (newDate: string) => {
    setEndDate(newDate);
    if (mode !== 'none') {
      onChange(encode(mode, weeks, monthlyPos, monthlyWeekday), endType, newDate || undefined, undefined);
    }
  };

  const handleEndCountChange = (newCount: number) => {
    setEndCount(newCount);
    if (mode !== 'none') {
      onChange(encode(mode, weeks, monthlyPos, monthlyWeekday), endType, undefined, newCount);
    }
  };

  return (
    <div className="space-y-2">
      <select
        value={mode}
        onChange={(e) => handleModeChange(e.target.value as SelectorMode)}
        className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
      >
        {MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {mode === 'every_n_weeks' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-grove-text-muted">Every</span>
          <input
            type="number"
            min={1}
            max={52}
            value={weeks}
            onChange={(e) => handleWeeksChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-16 px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs text-center focus:outline-none focus:ring-1 focus:ring-grove-accent"
          />
          <span className="text-xs text-grove-text-muted">weeks</span>
        </div>
      )}

      {mode === 'monthly_nth_weekday' && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={monthlyPos}
            onChange={(e) => handleMonthlyPosChange(parseInt(e.target.value, 10))}
            className="px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs focus:outline-none focus:ring-1 focus:ring-grove-accent"
          >
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            value={monthlyWeekday}
            onChange={(e) => handleMonthlyWeekdayChange(e.target.value)}
            className="px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs focus:outline-none focus:ring-1 focus:ring-grove-accent"
          >
            {WEEKDAYS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
          <span className="text-xs text-grove-text-muted">of the month</span>
        </div>
      )}

      {mode !== 'none' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-grove-text-muted">Ends:</span>
          <select
            value={endType}
            onChange={(e) => handleEndTypeChange(e.target.value as RecurrenceEndType)}
            className="px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs focus:outline-none focus:ring-1 focus:ring-grove-accent"
          >
            <option value="never">Never</option>
            <option value="on_date">On date</option>
            <option value="after_count">After</option>
          </select>
          {endType === 'on_date' && (
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs focus:outline-none focus:ring-1 focus:ring-grove-accent"
            />
          )}
          {endType === 'after_count' && (
            <>
              <input
                type="number"
                min={1}
                max={365}
                value={endCount}
                onChange={(e) => handleEndCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-xs text-center focus:outline-none focus:ring-1 focus:ring-grove-accent"
              />
              <span className="text-xs text-grove-text-muted">times</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
