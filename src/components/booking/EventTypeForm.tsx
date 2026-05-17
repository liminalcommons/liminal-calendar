'use client';

/**
 * EventTypeForm — create or edit a single event type. POSTs to
 * /api/booking/event-types on create, PATCHes /api/booking/event-types/[id]
 * on edit. Mirrors server-side zod constraints for required fields.
 *
 * Task 7 of Plan 3 (1:1 Booking).
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

export interface EventTypeRecord {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  locationKind: 'castalia' | 'external_link' | 'in_person';
  locationValue: string | null;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
}

interface EventTypeFormProps {
  initial?: EventTypeRecord | null;
  onSaved: (record: EventTypeRecord) => void;
  onCancel: () => void;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const PRESET_DURATIONS = [15, 30, 45, 60];

export function EventTypeForm({ initial, onSaved, onCancel }: EventTypeFormProps) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [duration, setDuration] = useState<number>(initial?.durationMinutes ?? 30);
  const [customDuration, setCustomDuration] = useState<boolean>(
    !!initial && !PRESET_DURATIONS.includes(initial.durationMinutes),
  );
  const [locationKind, setLocationKind] = useState<'castalia' | 'external_link' | 'in_person'>(
    initial?.locationKind ?? 'castalia',
  );
  const [locationValue, setLocationValue] = useState(initial?.locationValue ?? '');
  const [bufferBefore, setBufferBefore] = useState(initial?.bufferBeforeMinutes ?? 0);
  const [bufferAfter, setBufferAfter] = useState(initial?.bufferAfterMinutes ?? 0);
  const [minNotice, setMinNotice] = useState(initial?.minNoticeMinutes ?? 60);
  const [maxDaysAhead, setMaxDaysAhead] = useState(initial?.maxDaysAhead ?? 30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // AI-suggest state. Hidden when editing — only useful for fresh
  // creates. The describe textarea is collapsible so it doesn't clutter
  // the form for users who prefer manual entry.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function onSuggestWithAi() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await apiFetch('/api/booking/event-types/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setAiError(data.error ?? 'Could not generate — try rephrasing.');
        return;
      }
      const { candidate } = (await res.json()) as { candidate: EventTypeRecord };
      setTitle(candidate.title);
      setSlug(candidate.slug);
      setDescription(candidate.description ?? '');
      setDuration(candidate.durationMinutes);
      setCustomDuration(!PRESET_DURATIONS.includes(candidate.durationMinutes));
      setLocationKind(candidate.locationKind);
      setLocationValue(candidate.locationValue ?? '');
      setBufferBefore(candidate.bufferBeforeMinutes);
      setBufferAfter(candidate.bufferAfterMinutes);
      setMinNotice(candidate.minNoticeMinutes);
      setMaxDaysAhead(candidate.maxDaysAhead);
      setFieldErrors({});
      setError(null);
    } catch {
      setAiError('Network error — please retry.');
    } finally {
      setAiBusy(false);
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (title.length > 120) errs.title = 'Title must be at most 120 chars';
    if (!slug.trim()) errs.slug = 'Slug is required';
    else if (!SLUG_RE.test(slug.trim())) errs.slug = 'Lowercase alphanumeric + hyphens, 2-50 chars';
    if (!Number.isFinite(duration) || duration < 5 || duration > 480)
      errs.duration = 'Duration must be 5-480 minutes';
    if (locationKind !== 'castalia' && !locationValue.trim())
      errs.locationValue = 'Location detail is required';
    if (minNotice < 0) errs.minNotice = 'Min notice cannot be negative';
    if (maxDaysAhead < 1) errs.maxDaysAhead = 'Max days ahead must be at least 1';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        slug: slug.trim().toLowerCase(),
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        durationMinutes: duration,
        locationKind,
        locationValue: locationKind === 'castalia' ? null : locationValue.trim(),
        bufferBeforeMinutes: bufferBefore,
        bufferAfterMinutes: bufferAfter,
        minNoticeMinutes: minNotice,
        maxDaysAhead: maxDaysAhead,
      };
      const url = editing
        ? `/api/booking/event-types/${initial!.id}`
        : '/api/booking/event-types';
      const res = await apiFetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) setError(data.error ?? 'Slug already in use');
        else if (res.status === 400) setError(data.error ?? 'Invalid input');
        else setError(data.error ?? 'Failed to save');
        return;
      }
      const saved = (await res.json()) as EventTypeRecord;
      onSaved(saved);
    } catch {
      setError('Network error — please retry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-grove-border bg-grove-bg p-4">
      {!editing && (
        <div className="rounded border border-dashed border-grove-accent/40 bg-grove-surface p-3 space-y-2">
          {!aiOpen ? (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm text-grove-accent hover:text-grove-accent-deep font-medium"
            >
              <Sparkles size={14} aria-hidden="true" />
              Describe with AI — let it fill the fields for you
            </button>
          ) : (
            <>
              <label className="block text-xs font-medium text-grove-text flex items-center gap-1.5">
                <Sparkles size={12} aria-hidden="true" className="text-grove-accent" />
                Describe the meeting in your own words
              </label>
              <textarea
                aria-label="AI event type description"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. 30-min coffee chat in Castalia, 15-min break between bookings, at least a day's notice"
                rows={2}
                className="w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { setAiOpen(false); setAiPrompt(''); setAiError(null); }}
                  className="text-xs text-grove-text-muted hover:text-grove-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void onSuggestWithAi()}
                  disabled={aiBusy || aiPrompt.trim().length < 3}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles size={12} aria-hidden="true" />
                  {aiBusy ? 'Generating…' : 'Generate'}
                </button>
              </div>
              {aiError && <p role="alert" className="text-xs text-red-700">{aiError}</p>}
              <p className="text-[10px] text-grove-text-muted">
                AI fills the fields below — review and edit before saving.
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-grove-text">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
        />
        {fieldErrors.title && <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.title}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-grove-text">Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="quick-chat"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm font-mono text-grove-text"
        />
        <p className="text-[10px] text-grove-text-muted mt-0.5">
          Lowercase letters, digits, and hyphens. 2-50 chars.
        </p>
        {fieldErrors.slug && <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.slug}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-grove-text">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-grove-text">Duration</label>
        <div className="mt-1 flex items-center gap-2">
          {!customDuration ? (
            <select
              aria-label="Duration"
              value={duration}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') {
                  setCustomDuration(true);
                } else {
                  setDuration(parseInt(v, 10));
                }
              }}
              className="px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
            >
              {PRESET_DURATIONS.map((d) => (
                <option key={d} value={d}>{d} minutes</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          ) : (
            <>
              <input
                type="number"
                aria-label="Custom duration"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
                min={5}
                max={480}
                className="w-24 px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
              />
              <span className="text-xs text-grove-text-muted">minutes</span>
              <button
                type="button"
                onClick={() => { setCustomDuration(false); setDuration(30); }}
                className="text-xs text-grove-accent hover:underline"
              >
                use preset
              </button>
            </>
          )}
        </div>
        {fieldErrors.duration && <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.duration}</p>}
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-grove-text">Where do you meet?</legend>
        <div className="mt-1 space-y-1">
          {(
            [
              ['castalia', 'In Castalia (a talk zone link is generated)'],
              ['external_link', 'External link (Zoom, Meet, etc.)'],
              ['in_person', 'In person (address or place)'],
            ] as const
          ).map(([kind, label]) => (
            <label key={kind} className="flex items-center gap-2 text-sm text-grove-text">
              <input
                type="radio"
                name="locationKind"
                value={kind}
                checked={locationKind === kind}
                onChange={() => setLocationKind(kind)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {locationKind !== 'castalia' && (
        <div>
          <label className="block text-xs font-medium text-grove-text">
            {locationKind === 'external_link' ? 'Meeting URL' : 'Address or place'}
          </label>
          <input
            type="text"
            aria-label="Location detail"
            value={locationValue}
            onChange={(e) => setLocationValue(e.target.value)}
            className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
          />
          {fieldErrors.locationValue && (
            <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.locationValue}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-grove-text">Buffer before (min)</label>
          <input
            type="number"
            min={0}
            max={240}
            value={bufferBefore}
            onChange={(e) => setBufferBefore(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
          />
          <p className="text-[10px] text-grove-text-muted mt-0.5">
            Padding before each booking (e.g. setup time).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-grove-text">Buffer after (min)</label>
          <input
            type="number"
            min={0}
            max={240}
            value={bufferAfter}
            onChange={(e) => setBufferAfter(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
          />
          <p className="text-[10px] text-grove-text-muted mt-0.5">
            Padding after each booking (e.g. notes / break).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-grove-text">Minimum notice (min)</label>
          <input
            type="number"
            min={0}
            value={minNotice}
            onChange={(e) => setMinNotice(parseInt(e.target.value, 10) || 0)}
            className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
          />
          <p className="text-[10px] text-grove-text-muted mt-0.5">
            How far ahead a booker must reserve (60 = at least 1h ahead).
          </p>
          {fieldErrors.minNotice && (
            <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.minNotice}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-grove-text">Max days ahead</label>
          <input
            type="number"
            min={1}
            max={365}
            value={maxDaysAhead}
            onChange={(e) => setMaxDaysAhead(parseInt(e.target.value, 10) || 1)}
            className="mt-1 w-full px-2 py-1 rounded border border-grove-border bg-white text-sm text-grove-text"
          />
          <p className="text-[10px] text-grove-text-muted mt-0.5">
            How far into the future bookings open.
          </p>
          {fieldErrors.maxDaysAhead && (
            <p role="alert" className="text-xs text-red-700 mt-1">{fieldErrors.maxDaysAhead}</p>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded border border-grove-border text-sm text-grove-text"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded bg-grove-accent text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create event type'}
        </button>
      </div>
    </form>
  );
}
