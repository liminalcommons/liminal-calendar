'use client';

/**
 * BookableWindowsEditor — per-day time-range editor. GETs the existing
 * windows on mount, PUTs the full set on save. Mirrors server overlap
 * detection client-side so save is disabled with a clear message before
 * a doomed request hits the API.
 *
 * Task 7 of Plan 3 (1:1 Booking).
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

interface ServerWindow {
  id: number;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

interface UIRange {
  start: string; // HH:MM
  end: string;   // HH:MM
}

// ISO-ish ordering: Mon..Sun in UI; database uses 0=Sun..6=Sat (JS Date).
// We map UI index 0=Mon..6=Sun to the JS dayOfWeek values 1..6,0.
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const UI_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h | 0) * 60 + (m | 0);
}

function toTimeStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function BookableWindowsEditor() {
  const [tz, setTz] = useState('UTC');
  const [byDay, setByDay] = useState<UIRange[][]>(() => Array.from({ length: 7 }, () => []));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setTz('UTC');
    }
    (async () => {
      try {
        const res = await apiFetch('/api/booking/windows');
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const rows = (await res.json()) as ServerWindow[];
        const next: UIRange[][] = Array.from({ length: 7 }, () => []);
        for (const row of rows) {
          const uiIdx = UI_TO_DOW.indexOf(row.dayOfWeek);
          if (uiIdx === -1) continue;
          next[uiIdx].push({
            start: toTimeStr(row.startMinute),
            end: toTimeStr(row.endMinute),
          });
        }
        for (const arr of next) arr.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        setByDay(next);
      } catch {
        // leave empty
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const overlap = useMemo(() => detectClientOverlap(byDay), [byDay]);
  const invalidRange = useMemo(() => detectInvalidRange(byDay), [byDay]);

  function addRange(dayIdx: number) {
    setByDay((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[dayIdx] = [...next[dayIdx], { start: '09:00', end: '17:00' }];
      return next;
    });
    setSaved(false);
  }

  function removeRange(dayIdx: number, rangeIdx: number) {
    setByDay((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[dayIdx] = next[dayIdx].filter((_, i) => i !== rangeIdx);
      return next;
    });
    setSaved(false);
  }

  function updateRange(dayIdx: number, rangeIdx: number, field: 'start' | 'end', val: string) {
    setByDay((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[dayIdx] = next[dayIdx].map((r, i) => (i === rangeIdx ? { ...r, [field]: val } : r));
      return next;
    });
    setSaved(false);
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    if (overlap) {
      setError('Overlapping windows on the same day are not allowed');
      return;
    }
    if (invalidRange) {
      setError('Each range must end after it starts');
      return;
    }
    setSaving(true);
    try {
      const payload: Array<{
        dayOfWeek: number;
        startMinute: number;
        endMinute: number;
        timezone: string;
      }> = [];
      for (let ui = 0; ui < 7; ui++) {
        for (const r of byDay[ui]) {
          payload.push({
            dayOfWeek: UI_TO_DOW[ui],
            startMinute: toMinutes(r.start),
            endMinute: toMinutes(r.end),
            timezone: tz,
          });
        }
      }
      const res = await apiFetch('/api/booking/windows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to save windows');
        return;
      }
      setSaved(true);
    } catch {
      setError('Network error — please retry.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-grove-text-muted">Loading availability…</p>;
  }

  const saveDisabled = saving || overlap || invalidRange;

  return (
    <div className="space-y-3">
      <p className="text-xs text-grove-text-muted">Timezone: <span className="font-mono">{tz}</span></p>
      <ul className="space-y-2">
        {DAY_LABELS.map((label, dayIdx) => {
          const ranges = byDay[dayIdx];
          return (
            <li key={label} className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="w-24 text-sm font-medium text-grove-text">{label}</div>
              <div className="flex-1 flex flex-wrap gap-2 items-center">
                {ranges.length === 0 && (
                  <span className="text-xs text-grove-text-muted italic">no availability</span>
                )}
                {ranges.map((r, rIdx) => (
                  <div
                    key={rIdx}
                    className="inline-flex items-center gap-1 rounded border border-grove-border bg-grove-bg px-2 py-1"
                  >
                    <input
                      type="time"
                      aria-label={`${label} start ${rIdx + 1}`}
                      value={r.start}
                      onChange={(e) => updateRange(dayIdx, rIdx, 'start', e.target.value)}
                      className="text-xs bg-transparent text-grove-text focus:outline-none"
                    />
                    <span className="text-xs text-grove-text-muted">–</span>
                    <input
                      type="time"
                      aria-label={`${label} end ${rIdx + 1}`}
                      value={r.end}
                      onChange={(e) => updateRange(dayIdx, rIdx, 'end', e.target.value)}
                      className="text-xs bg-transparent text-grove-text focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${label} range ${rIdx + 1}`}
                      onClick={() => removeRange(dayIdx, rIdx)}
                      className="ml-1 text-grove-text-muted hover:text-red-700"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addRange(dayIdx)}
                  aria-label={`Add range to ${label}`}
                  className="inline-flex items-center gap-1 text-xs text-grove-accent hover:underline"
                >
                  <Plus size={12} /> Add range
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {overlap && (
        <p role="alert" className="text-xs text-red-700">
          Overlapping windows on the same day are not allowed.
        </p>
      )}
      {invalidRange && !overlap && (
        <p role="alert" className="text-xs text-red-700">
          Each range must end after it starts.
        </p>
      )}
      {error && !overlap && !invalidRange && (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      )}
      {saved && (
        <p role="status" className="text-xs text-emerald-700">Saved.</p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Save availability'}
      </button>
    </div>
  );
}

// Exported only for tests.
export function detectClientOverlap(byDay: UIRange[][]): boolean {
  for (const day of byDay) {
    const sorted = day
      .map((r) => ({ s: toMinutes(r.start), e: toMinutes(r.end) }))
      .filter((r) => r.e > r.s)
      .sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].s < sorted[i - 1].e) return true;
    }
  }
  return false;
}

function detectInvalidRange(byDay: UIRange[][]): boolean {
  for (const day of byDay) {
    for (const r of day) {
      if (toMinutes(r.end) <= toMinutes(r.start)) return true;
    }
  }
  return false;
}
