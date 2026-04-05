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
  { value: 'fortnightly', label: 'Fortnightly' },
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
    <div className="space-y-2">
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

      {value !== 'none' && (
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
