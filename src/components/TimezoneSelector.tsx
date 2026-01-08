'use client';

import { useState } from 'react';

// Common timezones grouped by region
const TIMEZONE_OPTIONS = [
  { group: 'Americas', zones: [
    { id: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
    { id: 'America/Denver', label: 'Denver (MT)' },
    { id: 'America/Chicago', label: 'Chicago (CT)' },
    { id: 'America/New_York', label: 'New York (ET)' },
    { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
    { id: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
    { id: 'America/Mexico_City', label: 'Mexico City (CST)' },
    { id: 'America/Toronto', label: 'Toronto (ET)' },
    { id: 'America/Vancouver', label: 'Vancouver (PT)' },
  ]},
  { group: 'Europe', zones: [
    { id: 'Europe/London', label: 'London (GMT)' },
    { id: 'Europe/Paris', label: 'Paris (CET)' },
    { id: 'Europe/Berlin', label: 'Berlin (CET)' },
    { id: 'Europe/Amsterdam', label: 'Amsterdam (CET)' },
    { id: 'Europe/Rome', label: 'Rome (CET)' },
    { id: 'Europe/Madrid', label: 'Madrid (CET)' },
    { id: 'Europe/Stockholm', label: 'Stockholm (CET)' },
    { id: 'Europe/Helsinki', label: 'Helsinki (EET)' },
    { id: 'Europe/Athens', label: 'Athens (EET)' },
    { id: 'Europe/Moscow', label: 'Moscow (MSK)' },
  ]},
  { group: 'Asia & Pacific', zones: [
    { id: 'Asia/Dubai', label: 'Dubai (GST)' },
    { id: 'Asia/Kolkata', label: 'India (IST)' },
    { id: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { id: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
    { id: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { id: 'Asia/Seoul', label: 'Seoul (KST)' },
    { id: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { id: 'Australia/Melbourne', label: 'Melbourne (AEST)' },
    { id: 'Pacific/Auckland', label: 'Auckland (NZST)' },
  ]},
  { group: 'Africa & Middle East', zones: [
    { id: 'Africa/Cairo', label: 'Cairo (EET)' },
    { id: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
    { id: 'Africa/Lagos', label: 'Lagos (WAT)' },
    { id: 'Asia/Jerusalem', label: 'Jerusalem (IST)' },
    { id: 'Asia/Riyadh', label: 'Riyadh (AST)' },
  ]},
];

interface TimezoneSelectorProps {
  currentTimezone: string;
  onSelect: (timezone: string) => void;
  onAutoDetect: () => void;
  onClose: () => void;
}

export function TimezoneSelector({ currentTimezone, onSelect, onAutoDetect, onClose }: TimezoneSelectorProps) {
  const [search, setSearch] = useState('');

  const filteredOptions = TIMEZONE_OPTIONS.map(group => ({
    ...group,
    zones: group.zones.filter(z =>
      z.label.toLowerCase().includes(search.toLowerCase()) ||
      z.id.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(group => group.zones.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-stone-200 bg-stone-50">
          <h3 className="font-semibold text-stone-800">Select Your Timezone</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Current: {currentTimezone.split('/').pop()?.replace(/_/g, ' ')}
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-stone-100">
          <input
            type="text"
            placeholder="Search timezone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
            autoFocus
          />
        </div>

        {/* Auto-detect option */}
        <div className="px-4 py-2 border-b border-stone-100">
          <button
            onClick={onAutoDetect}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gold-50 transition-colors text-left"
          >
            <span className="text-xl">📍</span>
            <div>
              <div className="text-sm font-medium text-stone-800">Auto-detect my location</div>
              <div className="text-xs text-stone-500">Uses browser geolocation (requires permission)</div>
            </div>
          </button>
        </div>

        {/* Timezone list */}
        <div className="max-h-[300px] overflow-y-auto">
          {filteredOptions.map(group => (
            <div key={group.group}>
              <div className="px-4 py-1.5 bg-stone-50 text-xs font-semibold text-stone-500 sticky top-0">
                {group.group}
              </div>
              {group.zones.map(zone => (
                <button
                  key={zone.id}
                  onClick={() => onSelect(zone.id)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gold-50 transition-colors flex items-center justify-between ${
                    currentTimezone === zone.id ? 'bg-gold-100 text-gold-900' : 'text-stone-700'
                  }`}
                >
                  <span>{zone.label}</span>
                  {currentTimezone === zone.id && <span className="text-gold-600">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-stone-200 bg-stone-50">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
