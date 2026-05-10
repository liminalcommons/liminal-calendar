'use client';

/**
 * EventTypeList — lists the caller's event types as cards, opens an inline
 * EventTypeForm for create/edit, and DELETEs with a confirm.
 *
 * Task 7 of Plan 3 (1:1 Booking).
 */

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';
import { EventTypeForm, type EventTypeRecord } from './EventTypeForm';

export function EventTypeList() {
  const [items, setItems] = useState<EventTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'create' } | { kind: 'edit'; record: EventTypeRecord }>(
    { kind: 'list' },
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/booking/event-types');
        if (!res.ok) {
          setError('Failed to load event types');
          return;
        }
        const rows = (await res.json()) as EventTypeRecord[];
        setItems(rows);
      } catch {
        setError('Network error loading event types');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onDelete(record: EventTypeRecord) {
    const ok = typeof window !== 'undefined' && window.confirm(
      `Delete "${record.title}"? This hides it from your booking page. Existing bookings keep their record.`,
    );
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/booking/event-types/${record.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Failed to delete event type');
        return;
      }
      setItems((prev) => prev.filter((r) => r.id !== record.id));
    } catch {
      setError('Network error during delete');
    }
  }

  function onSaved(saved: EventTypeRecord) {
    setItems((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setMode({ kind: 'list' });
  }

  if (loading) return <p className="text-sm text-grove-text-muted">Loading event types…</p>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      {mode.kind === 'list' && (
        <>
          {items.length === 0 ? (
            <p className="text-sm text-grove-text-muted italic">No event types yet.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="rounded border border-grove-border bg-grove-bg p-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-medium text-grove-text truncate">{r.title}</h3>
                      <span className="text-xs text-grove-text-muted">{r.durationMinutes} min</span>
                    </div>
                    <p className="text-xs text-grove-text-muted font-mono">/{r.slug}</p>
                    <p className="text-xs text-grove-text-muted mt-0.5 capitalize">
                      {r.locationKind.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${r.title}`}
                      onClick={() => setMode({ kind: 'edit', record: r })}
                      className="p-1.5 rounded hover:bg-grove-border/30 text-grove-text-muted"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${r.title}`}
                      onClick={() => onDelete(r)}
                      className="p-1.5 rounded hover:bg-grove-border/30 text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setMode({ kind: 'create' })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium"
          >
            <Plus size={14} />
            Create event type
          </button>
        </>
      )}

      {mode.kind === 'create' && (
        <EventTypeForm onSaved={onSaved} onCancel={() => setMode({ kind: 'list' })} />
      )}

      {mode.kind === 'edit' && (
        <EventTypeForm
          initial={mode.record}
          onSaved={onSaved}
          onCancel={() => setMode({ kind: 'list' })}
        />
      )}
    </div>
  );
}
