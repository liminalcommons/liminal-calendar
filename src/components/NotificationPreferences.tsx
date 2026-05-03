'use client';

import { useEffect, useState } from 'react';

type Prefs = {
  pushOneHour: boolean;
  pushFifteenMin: boolean;
  pushAtStart: boolean;
  emailTwentyFourHour: boolean;
  emailOneHour: boolean;
  emailFifteenMin: boolean;
};

const PUSH_ROWS: Array<{ name: keyof Prefs; label: string }> = [
  { name: 'pushOneHour', label: '1 hour before' },
  { name: 'pushFifteenMin', label: '15 minutes before' },
  { name: 'pushAtStart', label: 'When the event starts' },
];

const EMAIL_ROWS: Array<{ name: keyof Prefs; label: string }> = [
  { name: 'emailTwentyFourHour', label: '24 hours before' },
  { name: 'emailOneHour', label: '1 hour before' },
  { name: 'emailFifteenMin', label: '15 minutes before' },
];

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/preferences/notifications')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setPrefs)
      .catch((e) => setError(e.message));
  }, []);

  async function toggle(name: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [name]: !prefs[name] };
    setPrefs(next);
    try {
      await fetch('/api/preferences/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [name]: next[name] }),
      });
    } catch (e) {
      setPrefs(prefs); // rollback
      setError(e instanceof Error ? e.message : 'save failed');
    }
  }

  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (!prefs) return <div className="text-grove-text-muted text-sm">Loading…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-grove-text mb-2">Push notifications</legend>
        {PUSH_ROWS.map((row) => (
          <label key={row.name} className="flex items-center gap-2 text-sm text-grove-text cursor-pointer">
            <input
              type="checkbox"
              name={row.name}
              checked={prefs[row.name]}
              onChange={() => toggle(row.name)}
            />
            {row.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-grove-text mb-2">Email notifications</legend>
        {EMAIL_ROWS.map((row) => (
          <label key={row.name} className="flex items-center gap-2 text-sm text-grove-text cursor-pointer">
            <input
              type="checkbox"
              name={row.name}
              checked={prefs[row.name]}
              onChange={() => toggle(row.name)}
            />
            {row.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
