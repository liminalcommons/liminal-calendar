'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/NavBar';
import { AvailabilityGrid } from '@/components/availability/AvailabilityGrid';
import { apiFetch } from '@/lib/api-fetch';

const COMMON_TIMEZONES = [
  'Pacific/Auckland',
  'Australia/Sydney',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/Helsinki',
  'Europe/Berlin',
  'Europe/London',
  'Atlantic/Azores',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

function formatTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const short = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || '';
    const offset = now.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).split('GMT').pop() || '';
    const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
    return `${city} (${short}, UTC${offset || '+0'})`;
  } catch {
    return tz.replace(/_/g, ' ');
  }
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [timezone, setTimezone] = useState('UTC');
  const [availability, setAvailability] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { router.replace('/'); return; }

    // Auto-detect timezone
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;

    apiFetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        if (data.timezone && data.timezone !== 'UTC') {
          setTimezone(data.timezone);
        } else {
          setTimezone(detected);
        }
        if (Array.isArray(data.availability)) {
          setAvailability(data.availability);
        }
        setLoading(false);
      })
      .catch(() => {
        setTimezone(detected);
        setLoading(false);
      });
  }, [status, router]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, availability }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // silent
    } finally {
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const user = session?.user as any;

  return (
    <div className="min-h-screen bg-grove-bg">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-grove-text-muted hover:text-grove-text mb-4 transition-colors"
        >
          ← Back
        </button>

        <div className="flex items-center gap-4 mb-8">
          {user?.image ? (
            <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-grove-accent flex items-center justify-center text-grove-surface text-lg font-semibold">
              {(user?.name || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-serif text-grove-text">{user?.name || 'Your Profile'}</h1>
            <p className="text-sm text-grove-text-muted">{user?.email}</p>
          </div>
        </div>

        {/* Timezone */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider mb-2">Your Timezone</h2>
          <div className="bg-grove-surface border border-grove-border rounded-xl p-4 max-w-lg">
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full text-sm bg-grove-bg border border-grove-border rounded-lg px-3 py-2.5
                         text-grove-text font-medium focus:outline-none focus:ring-1 focus:ring-grove-accent"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz} className="bg-grove-surface text-grove-text">
                  {formatTimezoneLabel(tz)}
                </option>
              ))}
            </select>
            <p className="text-xs text-grove-accent mt-2 font-medium">
              Currently: {formatTimezoneLabel(timezone)}
            </p>
          </div>
        </div>

        {/* Availability grid */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-grove-text uppercase tracking-wider mb-2">Weekly Availability</h2>
          <p className="text-xs text-grove-text-muted mb-4">
            Mark the times you&apos;re generally available. This helps others find the best time for events.
          </p>
          {loading ? (
            <div className="h-64 bg-grove-surface rounded-lg animate-pulse" />
          ) : (
            <AvailabilityGrid
              value={availability}
              onChange={setAvailability}
              timezone={timezone}
            />
          )}
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 rounded-lg bg-grove-accent-deep text-grove-surface text-sm font-medium
                     hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
        </button>
      </main>
    </div>
  );
}
