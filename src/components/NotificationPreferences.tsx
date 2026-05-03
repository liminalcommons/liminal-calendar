'use client';

import { useEffect, useState } from 'react';
import { Bell, Mail } from 'lucide-react';

type Prefs = {
  pushOneHour: boolean;
  pushFifteenMin: boolean;
  pushAtStart: boolean;
  emailTwentyFourHour: boolean;
  emailOneHour: boolean;
  emailFifteenMin: boolean;
};

type Row = { name: keyof Prefs; label: string; hint: string };

const PUSH_ROWS: Row[] = [
  { name: 'pushOneHour', label: '1 hour before', hint: 'Heads-up about an hour ahead.' },
  { name: 'pushFifteenMin', label: '15 minutes before', hint: 'Get ready — wrap up what you’re doing.' },
  { name: 'pushAtStart', label: 'When the event starts', hint: 'Ping the moment it begins.' },
];

const EMAIL_ROWS: Row[] = [
  { name: 'emailTwentyFourHour', label: '24 hours before', hint: 'Daily lookahead in your inbox.' },
  { name: 'emailOneHour', label: '1 hour before', hint: 'A nudge for events you care about.' },
  { name: 'emailFifteenMin', label: '15 minutes before', hint: 'Last-minute backup if push fails.' },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-grove-accent/40 ${
        checked ? 'bg-grove-accent' : 'bg-grove-border/60'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PrefRow({ row, value, onToggle }: { row: Row; value: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-grove-text">{row.label}</div>
        <div className="text-xs text-grove-text-muted mt-0.5">{row.hint}</div>
      </div>
      <Toggle checked={value} onChange={onToggle} label={row.label} />
    </div>
  );
}

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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <fieldset className="rounded-lg border border-grove-border/40 bg-grove-surface/40 p-4">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-grove-text">
          <Bell size={14} />
          Push
        </legend>
        <div className="divide-y divide-grove-border/30">
          {PUSH_ROWS.map((row) => (
            <PrefRow key={row.name} row={row} value={prefs[row.name]} onToggle={() => toggle(row.name)} />
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-grove-border/40 bg-grove-surface/40 p-4">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-grove-text">
          <Mail size={14} />
          Email
        </legend>
        <div className="divide-y divide-grove-border/30">
          {EMAIL_ROWS.map((row) => (
            <PrefRow key={row.name} row={row} value={prefs[row.name]} onToggle={() => toggle(row.name)} />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
