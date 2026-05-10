'use client';

/**
 * HandleEditor — set or change the member's public handle. PUTs
 * /api/profile/handle and surfaces server errors (400 invalid / 409 taken).
 *
 * The initial handle is passed in as a prop because there is no GET
 * endpoint for /api/profile/handle (server component reads it from
 * getCurrentMember(db) on the page).
 *
 * Task 7 of Plan 3 (1:1 Booking).
 */

import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;

interface HandleEditorProps {
  initialHandle: string | null;
}

export function HandleEditor({ initialHandle }: HandleEditorProps) {
  const [handle, setHandle] = useState(initialHandle ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const normalized = handle.toLowerCase().trim();
  const clientValid = normalized.length === 0 || HANDLE_RE.test(normalized);
  const formatHint =
    'lowercase letters, digits, and hyphens; 3-30 chars; starts with a letter or digit';

  async function onSave() {
    setError(null);
    setSaved(false);
    if (!normalized) {
      setError('handle is required');
      return;
    }
    if (!HANDLE_RE.test(normalized)) {
      setError(formatHint);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile/handle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: normalized }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) {
          setError(data.error ?? 'handle is taken');
        } else if (res.status === 400) {
          setError(data.error ?? 'invalid handle');
        } else if (res.status === 401) {
          setError('You need to sign in again.');
        } else {
          setError(data.error ?? 'Failed to save handle');
        }
        return;
      }
      const data = (await res.json()) as { handle: string };
      setHandle(data.handle);
      setSaved(true);
    } catch {
      setError('Network error — please retry.');
    } finally {
      setSaving(false);
    }
  }

  const previewBase = 'liminalcalendar.com';
  const showPreview = normalized.length > 0 && clientValid;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex items-center gap-1 text-sm text-grove-text-muted">
          <span>{previewBase}/</span>
        </div>
        <input
          type="text"
          aria-label="Handle"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setError(null);
            setSaved(false);
          }}
          placeholder="your-handle"
          className="flex-1 px-3 py-1.5 rounded border border-grove-border bg-grove-bg text-grove-text text-sm focus:outline-none focus:ring-1 focus:ring-grove-accent"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !normalized || !clientValid}
          className="px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {showPreview && (
        <p className="text-xs text-grove-text-muted">
          Preview: <span className="font-mono">{previewBase}/{normalized}/&lt;slug&gt;</span>
        </p>
      )}
      {!clientValid && !error && (
        <p role="alert" className="text-xs text-amber-700">{formatHint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      )}
      {saved && (
        <p role="status" className="text-xs text-emerald-700">Saved.</p>
      )}
    </div>
  );
}
