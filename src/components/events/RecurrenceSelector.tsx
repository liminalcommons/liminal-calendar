'use client';

import { useState } from 'react';

export type RecurrenceValue = 'none' | 'daily' | 'weekly' | 'fortnightly' | 'monthly';
export type RecurrenceEndType = 'never' | 'on_date' | 'after_count';

interface RecurrenceSelectorProps {
  value: RecurrenceValue;
  onChange: (value: RecurrenceValue, endType?: RecurrenceEndType, endDate?: string, endCount?: number) => void;
}

const RECURRENCE_OPTIONS: { value: RecurrenceValue; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly (every 2 weeks)' },
  { value: 'monthly', label: 'Monthly' },
];

export function RecurrenceSelector({ value, onChange }: RecurrenceSelectorProps) {
  const [endType, setEndType] = useState<RecurrenceEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [endCount, setEndCount] = useState(12);

  const handleRecurrenceChange = (newValue: RecurrenceValue) => {
    if (newValue === 'none') {
      onChange(newValue);
    } else {
      onChange(newValue, endType, endDate || undefined, endType === 'after_count' ? endCount : undefined);
    }
  };

  const handleEndTypeChange = (newEndType: RecurrenceEndType) => {
    setEndType(newEndType);
    if (value !== 'none') {
      onChange(
        value,
        newEndType,
        newEndType === 'on_date' ? endDate : undefined,
        newEndType === 'after_count' ? endCount : undefined,
      );
    }
  };

  const handleEndDateChange = (newDate: string) => {
    setEndDate(newDate);
    if (value !== 'none') {
      onChange(value, endType, newDate || undefined, undefined);
    }
  };

  const handleEndCountChange = (newCount: number) => {
    setEndCount(newCount);
    if (value !== 'none') {
      onChange(value, endType, undefined, newCount);
    }
  };

  return (
    <div className="space-y-3">
      {/* Recurrence dropdown */}
      <select
        value={value}
        onChange={(e) => handleRecurrenceChange(e.target.value as RecurrenceValue)}
        className="w-full px-3 py-2 border border-grove-border rounded-lg bg-grove-surface text-grove-text focus:outline-none focus:ring-2 focus:ring-grove-accent focus:border-transparent text-sm"
      >
        {RECURRENCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* End condition — only shown when recurrence is set */}
      {value !== 'none' && (
        <div className="pl-3 border-l-2 border-grove-border space-y-2">
          <p className="text-xs font-medium text-grove-text-muted uppercase tracking-wide">Ends</p>

          {/* Never */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recurrence-end"
              value="never"
              checked={endType === 'never'}
              onChange={() => handleEndTypeChange('never')}
              className="accent-grove-accent"
            />
            <span className="text-sm text-grove-text">Never</span>
          </label>

          {/* On date */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recurrence-end"
              value="on_date"
              checked={endType === 'on_date'}
              onChange={() => handleEndTypeChange('on_date')}
              className="accent-grove-accent"
            />
            <span className="text-sm text-grove-text">On date</span>
            {endType === 'on_date' && (
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="ml-2 px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-sm focus:outline-none focus:ring-1 focus:ring-grove-accent"
              />
            )}
          </label>

          {/* After N occurrences */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="recurrence-end"
              value="after_count"
              checked={endType === 'after_count'}
              onChange={() => handleEndTypeChange('after_count')}
              className="accent-grove-accent"
            />
            <span className="text-sm text-grove-text">After</span>
            {endType === 'after_count' && (
              <input
                type="number"
                min={1}
                max={365}
                value={endCount}
                onChange={(e) => handleEndCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 px-2 py-1 border border-grove-border rounded bg-grove-surface text-grove-text text-sm text-center focus:outline-none focus:ring-1 focus:ring-grove-accent"
              />
            )}
            <span className="text-sm text-grove-text-muted">occurrences</span>
          </label>
        </div>
      )}
    </div>
  );
}
