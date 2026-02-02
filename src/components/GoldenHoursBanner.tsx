'use client';

import { useEffect, useState } from 'react';
import {
  getUserTimezone,
  getGoldenHourStatus,
  getTodaysGoldenHours,
  formatTimeInTimezone,
  getGoldenHoursForAllTimezones,
  isGoldenHour,
} from '@/lib/golden-hours';
import { SunRune, ThresholdRune } from './runes';
import { WorldClockStrip } from './TimeZoneStrip';

const BANNER_COLLAPSED_KEY = 'liminal-calendar-banner-collapsed';

export function GoldenHoursBanner() {
  const [timezone, setTimezone] = useState<string>('UTC');
  const [status, setStatus] = useState<string>('');
  const [isGolden, setIsGolden] = useState(false);
  const [showAllTimezones, setShowAllTimezones] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tz = getUserTimezone();
    setTimezone(tz);
    setStatus(getGoldenHourStatus(tz));
    setIsGolden(isGoldenHour(new Date()));

    // Load collapsed preference from localStorage
    const savedCollapsed = localStorage.getItem(BANNER_COLLAPSED_KEY);
    if (savedCollapsed !== null) {
      setIsCollapsed(savedCollapsed === 'true');
    }

    // Update every minute
    const interval = setInterval(() => {
      setStatus(getGoldenHourStatus(tz));
      setIsGolden(isGoldenHour(new Date()));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem(BANNER_COLLAPSED_KEY, String(newState));
  };

  if (!mounted) {
    return (
      <div className="portal-frame p-6 mb-6 animate-pulse" style={{ background: 'var(--stone-100)' }}>
        <div className="h-6 rounded w-48" style={{ background: 'var(--stone-200)' }}></div>
      </div>
    );
  }

  const { start, end, isWeekend } = getTodaysGoldenHours(timezone);
  const localStart = formatTimeInTimezone(start, timezone);
  const localEnd = formatTimeInTimezone(end, timezone);
  const allTimezones = getGoldenHoursForAllTimezones();

  // Collapsed view - just a minimal header bar
  if (isCollapsed) {
    return (
      <div
        className="portal-frame p-3 mb-6 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={toggleCollapsed}
        style={{
          background: 'var(--stone-50)',
          borderColor: 'var(--stone-200)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            {isGolden ? <SunRune size="sm" variant="gold" /> : <ThresholdRune size="sm" />}
            <span>
              {isGolden ? 'Golden Hours active' : 'Golden Hours'}: {localStart} – {localEnd}
            </span>
            {isGolden && (
              <span className="px-1.5 py-0.5 bg-gold-200 text-gold-800 text-xs rounded">
                NOW
              </span>
            )}
          </div>
          <span className="text-xs text-stone-400">Click to expand</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`portal-frame p-6 mb-6 transition-all ${
        isGolden ? 'golden-glow-active' : ''
      }`}
      style={{
        background: isGolden
          ? 'linear-gradient(135deg, var(--gold-100), var(--gold-200))'
          : 'linear-gradient(135deg, var(--stone-50), var(--parchment))',
        borderColor: isGolden ? 'var(--gold-400)' : 'var(--stone-300)',
      }}
    >
      {/* Collapse button in top-right */}
      <button
        onClick={toggleCollapsed}
        className="absolute top-2 right-2 p-1.5 rounded hover:bg-stone-200/50 transition-colors text-stone-400 hover:text-stone-600"
        title="Collapse banner"
        style={{ position: 'absolute' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {isGolden ? (
                <SunRune size="xl" />
              ) : (
                <ThresholdRune size="xl" />
              )}
            </span>
            <div>
              <h2 className="font-rune text-xl" style={{ color: isGolden ? 'var(--gold-900)' : 'var(--stone-800)' }}>
                {isGolden ? (
                  <>
                    <SunRune size="md" className="mr-1" />
                    The Threshold is Open
                    <SunRune size="md" className="ml-1" />
                  </>
                ) : (
                  'Golden Hours'
                )}
              </h2>
              <p className="text-sm mt-1" style={{ color: isGolden ? 'var(--gold-700)' : 'var(--stone-600)' }}>
                {status}
              </p>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--stone-500)' }}>
            {timezone.split('/').pop()?.replace('_', ' ')}
          </p>
          <p className="font-rune text-2xl" style={{ color: isGolden ? 'var(--gold-800)' : 'var(--stone-700)' }}>
            {localStart} – {localEnd}
          </p>
          <span
            className="inline-block mt-1 text-xs px-2 py-0.5 rounded"
            style={{
              background: isGolden ? 'var(--gold-300)' : 'var(--stone-200)',
              color: isGolden ? 'var(--gold-900)' : 'var(--stone-700)',
            }}
          >
            {isWeekend ? 'Weekend (3h)' : 'Weekday (2h)'}
          </span>
        </div>
      </div>

      <div className="horizon-line my-4" />

      {/* World Clock Strip - shows current time across all regions */}
      <div className="mb-4">
        <WorldClockStrip />
      </div>

      <button
        onClick={() => setShowAllTimezones(!showAllTimezones)}
        className="text-sm threshold-glow px-3 py-1 rounded transition-colors"
        style={{
          color: 'var(--gold-700)',
          background: 'transparent',
          border: '1px solid var(--gold-300)',
        }}
      >
        {showAllTimezones ? 'Hide Golden Hours table ᛇ' : 'Show Golden Hours table ᛇ'}
      </button>

      {showAllTimezones && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--stone-200)' }}>
          <p className="text-xs text-stone-500 mb-2">Golden Hours by timezone:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-sm">
            {allTimezones.map(({ label, start, end }) => (
              <div
                key={label}
                className="text-center p-2 rounded"
                style={{ background: 'var(--stone-50)' }}
              >
                <p className="font-medium" style={{ color: 'var(--stone-700)' }}>{label}</p>
                <p className="font-mono text-sm" style={{ color: 'var(--stone-600)' }}>
                  {start}–{end}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
