'use client';

/**
 * Admin mailing-list composer. Shows the auto-generated audience (members +
 * newsletter opt-ins, deduped, minus unsubscribes), lets the admin write a
 * monthly update, preview recipients via a dry run, then send. A human is
 * always in the loop — nothing sends without an explicit confirmed click.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { SchemaRepairBanner } from './SchemaRepairBanner';

interface AudienceSummary {
  /** Set when newsletter_subscribers doesn't exist — see SchemaRepairBanner. */
  schemaMissing?: boolean;
  totalRecipients: number;
  memberCount: number;
  subscriberCount: number;
  suppressedCount: number;
  sample: { email: string; name: string | null }[];
}

interface SendResult {
  dryRun: boolean;
  attempted?: number;
  sent?: number;
  failed?: number;
  wouldSend?: number;
  truncated?: boolean;
  totalAudience?: number;
  message?: string;
  sample?: { email: string; name: string | null }[];
  failures?: { email: string; error?: string }[];
}

export function NewsletterPanel() {
  const [summary, setSummary] = useState<AudienceSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<null | 'preview' | 'send'>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  const loadAudience = useCallback(async () => {
    const r = await apiFetch('/api/admin/newsletter', { method: 'GET' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as AudienceSummary;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAudience()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => !cancelled && setLoadError('Failed to load audience'));
    return () => {
      cancelled = true;
    };
  }, [loadAudience]);

  const canSubmit = subject.trim().length > 0 && body.trim().length > 0;

  async function run(dryRun: boolean) {
    setError(null);
    setResult(null);
    setBusy(dryRun ? 'preview' : 'send');
    try {
      const res = await apiFetch('/api/admin/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), dryRun }),
      });
      const data = (await res.json()) as SendResult & { error?: string };
      if (!res.ok) {
        setError(data.error || 'Request failed');
        return;
      }
      setResult(data);
      if (!dryRun) setConfirmSend(false);
    } catch {
      setError('Request failed');
    } finally {
      setBusy(null);
    }
  }

  // The table is missing, not the data — offer the repair rather than an
  // audience of zero that looks like "nobody has signed up".
  if (summary?.schemaMissing) {
    return (
      <SchemaRepairBanner
        table="newsletter_subscribers"
        onRepaired={() => {
          loadAudience().then(setSummary).catch(() => setLoadError('Failed to load audience'));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Audience summary */}
      <div className="bg-grove-surface border border-grove-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-grove-text mb-1">Audience</h3>
        {loadError ? (
          <p className="text-xs text-red-400">{loadError}</p>
        ) : !summary ? (
          <p className="text-xs text-grove-text-muted italic">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-grove-text-muted">
              <span className="text-grove-text font-medium">{summary.totalRecipients.toLocaleString()}</span> recipients
              {' '}· {summary.memberCount.toLocaleString()} members · {summary.subscriberCount.toLocaleString()} subscribers
              {summary.suppressedCount > 0 && <> · {summary.suppressedCount.toLocaleString()} unsubscribed (excluded)</>}
            </p>
            <p className="text-[11px] text-grove-text-dim mt-1">
              Generated automatically from members with an email + newsletter opt-ins, deduplicated.
            </p>
          </>
        )}
      </div>

      {/* Composer */}
      <div className="space-y-3">
        <div>
          <label htmlFor="nl-subject" className="block text-xs font-medium text-grove-text-muted mb-1">Subject</label>
          <input
            id="nl-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="This month at Liminal Commons"
            className="w-full px-3 py-2 text-sm rounded-lg bg-grove-bg border border-grove-border text-grove-text placeholder:text-grove-text-dim focus:outline-none focus:ring-1 focus:ring-grove-accent"
          />
        </div>
        <div>
          <label htmlFor="nl-body" className="block text-xs font-medium text-grove-text-muted mb-1">Message</label>
          <textarea
            id="nl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder={"Write your monthly update here.\n\nBlank lines separate paragraphs. Recipients see a greeting with their name and an unsubscribe link automatically."}
            className="w-full px-3 py-2 text-sm rounded-lg bg-grove-bg border border-grove-border text-grove-text placeholder:text-grove-text-dim focus:outline-none focus:ring-1 focus:ring-grove-accent resize-y"
          />
          <p className="text-[11px] text-grove-text-dim mt-1">
            Plain text. Blank lines become paragraphs. An unsubscribe link is added to every email.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(true)}
          disabled={!canSubmit || busy !== null}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-grove-border text-grove-text hover:border-grove-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'preview' ? 'Previewing…' : 'Preview recipients (dry run)'}
        </button>

        {!confirmSend ? (
          <button
            onClick={() => setConfirmSend(true)}
            disabled={!canSubmit || busy !== null}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-grove-accent text-grove-surface hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            Send…
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-grove-text-muted">
              Send to {summary?.totalRecipients.toLocaleString() ?? '…'} recipients?
            </span>
            <button
              onClick={() => run(false)}
              disabled={busy !== null}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {busy === 'send' ? 'Sending…' : 'Confirm send'}
            </button>
            <button
              onClick={() => setConfirmSend(false)}
              disabled={busy !== null}
              className="px-3 py-2 text-sm text-grove-text-muted hover:text-grove-text"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {/* Result */}
      {result && (
        <div className="bg-grove-surface border border-grove-border rounded-xl p-4 text-sm">
          {result.dryRun ? (
            <>
              <p className="text-grove-text font-medium mb-1">Dry run — nothing was sent.</p>
              <p className="text-grove-text-muted">
                Would send to <span className="text-grove-text">{result.wouldSend?.toLocaleString()}</span> recipients.
                {result.truncated && ' (Audience exceeds the per-send cap; the rest would need a follow-up run.)'}
              </p>
              {result.sample && result.sample.length > 0 && (
                <ul className="mt-2 text-xs text-grove-text-muted space-y-0.5">
                  {result.sample.map((s) => (
                    <li key={s.email}>{s.name ? `${s.name} · ` : ''}{s.email}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="text-grove-text font-medium mb-1">Send complete.</p>
              <p className="text-grove-text-muted">
                Sent <span className="text-grove-text">{result.sent?.toLocaleString()}</span> of {result.attempted?.toLocaleString()}
                {result.failed ? <> · <span className="text-red-400">{result.failed} failed</span></> : null}
                {result.truncated && ' · audience truncated at the per-send cap'}
              </p>
              {result.failures && result.failures.length > 0 && (
                <ul className="mt-2 text-xs text-red-400 space-y-0.5">
                  {result.failures.map((f) => (
                    <li key={f.email}>{f.email}{f.error ? ` — ${f.error}` : ''}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
