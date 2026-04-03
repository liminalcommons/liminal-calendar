'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Clock, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Generate default availability: available every day 7am-11pm local.
 * Returns UTC slot indices. This blocks sleeping hours (11pm-7am).
 */
function generateDefaultSlots(timezone: string): number[] {
  let offsetMinutes = 0;
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const localStr = now.toLocaleString('en-US', { timeZone: timezone });
    offsetMinutes = (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
  } catch { /* fallback to 0 */ }

  const offsetSlots = Math.round(offsetMinutes / 30);
  const slots: number[] = [];

  for (let day = 0; day < 7; day++) {
    // 7am = slot 14, 11pm = slot 46 (local)
    for (let s = 14; s < 46; s++) {
      let utc = day * 48 + s - offsetSlots;
      if (utc < 0) utc += 336;
      if (utc >= 336) utc -= 336;
      slots.push(utc);
    }
  }
  return slots;
}

export function AvailabilityBanner() {
  const { data: session, status } = useSession();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [settingDefaults, setSettingDefaults] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    // Check if dismissed this session
    if (sessionStorage.getItem('avail-banner-dismissed')) return;

    apiFetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (!data.availability || data.availability.length === 0) {
          setNeedsSetup(true);
        }
      })
      .catch(() => {});
  }, [status]);

  const handleSetDefaults = async () => {
    setSettingDefaults(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const defaults = generateDefaultSlots(tz);
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz, availability: defaults }),
      });
      setNeedsSetup(false);
    } catch { /* silent */ }
    finally { setSettingDefaults(false); }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('avail-banner-dismissed', '1');
  };

  if (!needsSetup || dismissed || status !== 'authenticated') return null;

  return (
    <div className="bg-grove-accent/10 border-b border-grove-accent/30 px-4 py-2.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Clock size={16} className="text-grove-accent shrink-0" />
        <p className="text-xs text-grove-text">
          <span className="font-semibold">Set your availability</span> so others can find the best time for events with you.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleSetDefaults}
          disabled={settingDefaults}
          className="text-[11px] px-3 py-1 rounded-md bg-grove-accent-deep text-grove-surface font-medium
                     hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {settingDefaults ? 'Setting...' : 'Use defaults (7am-11pm)'}
        </button>
        <Link
          href="/profile"
          className="text-[11px] px-3 py-1 rounded-md border border-grove-accent/40 text-grove-accent-deep font-medium
                     hover:bg-grove-accent/10 transition-colors"
        >
          Customize
        </Link>
        <button onClick={handleDismiss} className="p-0.5 text-grove-text-muted hover:text-grove-text transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
