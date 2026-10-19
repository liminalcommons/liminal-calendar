'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-fetch';
import type { DisplayEvent } from '@/lib/display-event';

interface ConferenceInfo {
  id: number;
  slug: string;
  name: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}

interface FlaggedDetail {
  conference: ConferenceInfo;
  flagged: DisplayEvent[];
}

/**
 * Admin → Conference tab: the Limicon retention worklist. Lists events the
 * creators flagged "continues beyond", with a one-click Retain that moves
 * each onto the permanent calendar (clears conference_id). Ending the
 * conference removes everything still linked from every view.
 */
export function ConferencePanel() {
  const [conferences, setConferences] = useState<ConferenceInfo[]>([]);
  const [slug, setSlug] = useState('limicon1');
  const [detail, setDetail] = useState<FlaggedDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (s: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/conference?slug=${encodeURIComponent(s)}&flagged=1`);
      if (!res.ok) {
        setError(`Could not load conference (HTTP ${res.status})`);
        setDetail(null);
        return;
      }
      setDetail(await res.json());
    } catch {
      setError('Could not reach the conference endpoint');
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    apiFetch('/api/admin/conference')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) {
          setConferences(d);
          if (d.length > 0 && !d.some((c: ConferenceInfo) => c.slug === slug)) {
            setSlug(d[0].slug);
          }
        }
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    void loadDetail(slug);
  }, [slug, loadDetail]);

  const retain = async (event: DisplayEvent) => {
    setBusy(`retain-${event.id}`);
    try {
      const res = await apiFetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId: null }),
      });
      if (res.ok) {
        setDetail((d) =>
          d ? { ...d, flagged: d.flagged.filter((e) => e.id !== event.id) } : d,
        );
      } else {
        setError(`Retain failed (HTTP ${res.status})`);
      }
    } catch {
      setError('Retain failed — network error');
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: string) => {
    if (!detail) return;
    if (status === 'ended' && !window.confirm('End the conference? Still-linked events vanish from every view. Retained events stay.')) {
      return;
    }
    setBusy('status');
    try {
      const res = await apiFetch('/api/admin/conference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, status }),
      });
      if (res.ok) await loadDetail(slug);
      else setError(`Status change failed (HTTP ${res.status})`);
    } catch {
      setError('Status change failed — network error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-grove-text-muted">Conference</label>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="px-2 py-1 text-sm rounded-md border border-grove-border bg-grove-surface text-grove-text"
        >
          {conferences.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.status})
            </option>
          ))}
        </select>
        {detail && (
          <span className="text-xs text-grove-text-muted">
            {detail.flagged.length} flagged to continue beyond
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      {detail && (
        <div className="bg-grove-surface border border-grove-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-grove-text">
              Status: {detail.conference.status}
            </span>
            {detail.conference.startsAt && (
              <span className="text-xs text-grove-text-muted">
                {new Date(detail.conference.startsAt).toLocaleDateString()} →{' '}
                {detail.conference.endsAt ? new Date(detail.conference.endsAt).toLocaleDateString() : '…'}
              </span>
            )}
            <span className="flex-1" />
            {detail.conference.status !== 'active' && (
              <button
                onClick={() => void setStatus('active')}
                disabled={busy === 'status'}
                className="px-2 py-1 text-xs rounded-md border border-grove-accent/60 text-grove-accent-deep hover:bg-grove-accent/10 disabled:opacity-50"
              >
                Activate
              </button>
            )}
            {detail.conference.status === 'active' && (
              <button
                onClick={() => void setStatus('ended')}
                disabled={busy === 'status'}
                className="px-2 py-1 text-xs rounded-md border border-red-700/60 text-red-300 hover:bg-red-900/20 disabled:opacity-50"
              >
                End conference
              </button>
            )}
          </div>
          <p className="text-xs text-grove-text-muted">
            Retain moves an event onto the permanent calendar. Ending the conference hides
            everything still linked; retained events are unaffected.
          </p>
        </div>
      )}

      {detail && detail.flagged.length > 0 && (
        <div className="bg-grove-surface border border-grove-border rounded-xl overflow-hidden">
          {detail.flagged.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-grove-border/40 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/events/${e.id}`}
                  className="text-sm font-medium text-grove-text hover:underline truncate block"
                >
                  {e.title}
                </Link>
                <p className="text-[11px] text-grove-text-muted">
                  {new Date(e.starts_at).toLocaleString()} · {e.creator_name}
                  {e.category ? ` · ${e.category}${e.category === 'other' && e.categoryOther ? `: ${e.categoryOther}` : ''}` : ''}
                </p>
              </div>
              <button
                onClick={() => void retain(e)}
                disabled={busy === `retain-${e.id}`}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-grove-accent-deep text-grove-surface hover:opacity-90 disabled:opacity-50 flex-shrink-0"
              >
                Retain
              </button>
            </div>
          ))}
        </div>
      )}

      {detail && detail.flagged.length === 0 && (
        <p className="text-sm text-grove-text-muted italic">
          Nothing flagged to continue beyond — creators tick the box on the event form.
        </p>
      )}
    </div>
  );
}
