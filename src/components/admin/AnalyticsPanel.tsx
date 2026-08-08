'use client';

/**
 * Admin analytics dashboard — traffic, guest counts, and clicks from the
 * first-party analytics_events table. Read-only; styled to match the other
 * admin panels (grove tokens, no external chart lib — a small inline bar
 * sparkline keeps this self-contained).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { ANALYTICS_ENDPOINT } from '@/lib/analytics/track';
import { SchemaRepairBanner } from './SchemaRepairBanner';

interface WindowStats {
  pageviews: number;
  uniqueVisitors: number;
  guestEntries: number;
  clicks: number;
  guestPageviews: number;
  visits: number;
  pagesPerVisit: number;
  bounceRate: number;
  newVisitors: number;
  returningVisitors: number;
}

interface Breakdown {
  label: string;
  count: number;
}

interface AnalyticsHealth {
  status: 'ok' | 'table_missing';
  tableExists: boolean;
  lastEventAt: string | null;
  totalEvents: number;
}

interface AnalyticsData {
  generatedAt: string;
  health?: AnalyticsHealth;
  allTime: { pageviews: number; uniqueVisitors: number; guestEntries: number; clicks: number };
  windows: { day: WindowStats; week: WindowStats; month: WindowStats };
  topPaths: { path: string; views: number }[];
  topClicks: { target: string; clicks: number }[];
  dailyPageviews: { date: string; views: number; guestViews: number }[];
  topReferrers?: Breakdown[];
  topCountries?: Breakdown[];
  devices?: Breakdown[];
  viewers?: Breakdown[];
}

/**
 * Outcome of the end-to-end pipeline test. The three failure kinds map to the
 * three places collection can break, which is the whole point — an empty
 * dashboard alone can't tell them apart.
 */
type SelfTest =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'blocked' }        // beacon never left this browser (content blocker)
  | { kind: 'not_recorded' }   // server took it, DB row didn't appear
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

type WindowKey = 'day' | 'week' | 'month' | 'all';

const WINDOW_LABELS: Record<WindowKey, string> = {
  day: 'Last 24h',
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: AnalyticsData };

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-grove-surface border border-grove-border rounded-xl px-4 py-3">
      <div className="text-2xl font-serif text-grove-text tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-grove-text-muted mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-grove-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

function TrendBars({ points }: { points: AnalyticsData['dailyPageviews'] }) {
  const max = Math.max(1, ...points.map((p) => p.views));
  return (
    <div>
      <div className="flex items-end gap-[3px] h-24" role="img" aria-label="Daily pageviews, last 30 days">
        {points.map((p) => {
          const h = Math.round((p.views / max) * 100);
          const guestH = p.views > 0 ? Math.round((p.guestViews / p.views) * h) : 0;
          return (
            <div
              key={p.date}
              className="flex-1 flex flex-col justify-end min-w-0"
              title={`${p.date}: ${p.views} views (${p.guestViews} guest)`}
            >
              <div className="w-full bg-grove-accent/30 rounded-sm relative" style={{ height: `${Math.max(h, 2)}%` }}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-grove-accent rounded-sm"
                  style={{ height: `${guestH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-grove-text-muted">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-grove-accent/30" /> pageviews</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-grove-accent" /> guest views</span>
      </div>
    </div>
  );
}

function RankedList({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: { label: string; value: number }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bg-grove-surface border border-grove-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-grove-text mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-grove-text-muted italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-grove-text truncate" title={r.label}>{r.label}</span>
                  <span className="text-xs text-grove-text-muted tabular-nums shrink-0">{r.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-grove-border/30 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-grove-accent/60 rounded-full" style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AnalyticsPanel() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [win, setWin] = useState<WindowKey>('week');
  const [selfTest, setSelfTest] = useState<SelfTest>({ kind: 'idle' });

  const load = useCallback(async (): Promise<AnalyticsData | null> => {
    const r = await apiFetch('/api/admin/analytics', { method: 'GET' });
    if (!r.ok) return null;
    return (await r.json()) as AnalyticsData;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (cancelled) return;
        setState(data ? { kind: 'ok', data } : { kind: 'error', message: 'Failed to load analytics' });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Failed to load analytics' });
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * Push one real event through the live beacon, then re-read the totals to
   * see whether it landed. This separates the three failure modes that all
   * look identical on the dashboard:
   *   - fetch throws          → a content blocker ate it in THIS browser
   *   - fetch ok, count flat  → server accepted but the write didn't persist
   *   - count went up         → collection works end to end
   */
  const runSelfTest = useCallback(async () => {
    setSelfTest({ kind: 'running' });
    const before = state.kind === 'ok' ? (state.data.health?.totalEvents ?? 0) : 0;

    try {
      await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'click', target: 'admin:self-test', path: '/admin' }),
      });
    } catch {
      // A blocked request rejects before reaching the network.
      setSelfTest({ kind: 'blocked' });
      return;
    }

    try {
      const data = await load();
      if (!data) {
        setSelfTest({ kind: 'error', message: 'Could not re-read analytics' });
        return;
      }
      setState({ kind: 'ok', data });
      const after = data.health?.totalEvents ?? 0;
      setSelfTest(after > before ? { kind: 'ok' } : { kind: 'not_recorded' });
    } catch {
      setSelfTest({ kind: 'error', message: 'Could not re-read analytics' });
    }
  }, [load, state]);

  if (state.kind === 'loading') {
    return <p className="text-sm text-grove-text-muted italic py-8 text-center">Loading…</p>;
  }
  if (state.kind === 'error') {
    return <p role="alert" className="text-sm text-red-400 py-8 text-center">{state.message}</p>;
  }

  const { data } = state;
  // All-time totals come from cheap COUNTs, which can't produce visit-shaped
  // metrics — those tiles are hidden for this window rather than shown as 0.
  const stats: WindowStats =
    win === 'all'
      ? {
          ...data.allTime,
          guestPageviews: 0,
          visits: 0, pagesPerVisit: 0, bounceRate: 0,
          newVisitors: 0, returningVisitors: 0,
        }
      : data.windows[win];
  const guestSub = win === 'all' ? undefined : `${stats.guestPageviews.toLocaleString()} guest views`;
  const health = data.health;

  return (
    <div className="space-y-6">
      {/* Pipeline health — shown whenever collection can't be assumed healthy.
          An empty dashboard is ambiguous on its own, so say which case it is. */}
      {health?.status === 'table_missing' ? (
        <SchemaRepairBanner
          table="analytics_events"
          onRepaired={() => {
            load().then((d) => d && setState({ kind: 'ok', data: d })).catch(() => {});
          }}
        />
      ) : health && health.totalEvents === 0 ? (
        <div className="bg-grove-surface border border-amber-700/40 rounded-xl p-4 space-y-1">
          <p className="text-sm font-medium text-grove-text">
            No events recorded yet.
          </p>
          <p className="text-xs text-grove-text-muted">
            The table exists and is readable — it’s simply empty. Run the pipeline test below
            to confirm collection is working before assuming this is a traffic problem.
          </p>
        </div>
      ) : null}

      {/* End-to-end pipeline test */}
      <div className="bg-grove-surface border border-grove-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-grove-text">Pipeline test</h3>
            <p className="text-xs text-grove-text-muted mt-0.5">
              Sends one real event and checks that it lands in the database.
            </p>
          </div>
          <button
            onClick={runSelfTest}
            disabled={selfTest.kind === 'running'}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-grove-border text-grove-text hover:bg-grove-border/20 disabled:opacity-50 shrink-0"
          >
            {selfTest.kind === 'running' ? 'Testing…' : 'Run test'}
          </button>
        </div>

        {selfTest.kind === 'ok' && (
          <p role="status" className="text-xs text-emerald-400 mt-3">
            Collection works end to end — the test event was written and read back. An empty
            dashboard means low traffic, not a broken pipeline.
          </p>
        )}
        {selfTest.kind === 'blocked' && (
          <p role="status" className="text-xs text-amber-400 mt-3">
            The beacon was blocked before leaving this browser — a content blocker or privacy
            extension. Visitors running one are invisible to analytics; everyone else is still
            counted normally. Whitelist the site to check your own visits.
          </p>
        )}
        {selfTest.kind === 'not_recorded' && (
          <p role="status" className="text-xs text-red-400 mt-3">
            The request was accepted but no row appeared — the write is failing server-side.
            Check the platform logs for
            <code className="mx-1 px-1 rounded bg-black/30">[analytics collect]</code> and
            <code className="mx-1 px-1 rounded bg-black/30">[boot-migrate]</code> entries.
          </p>
        )}
        {selfTest.kind === 'error' && (
          <p role="alert" className="text-xs text-red-400 mt-3">{selfTest.message}</p>
        )}
      </div>

      {/* Window selector */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(WINDOW_LABELS) as WindowKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setWin(k)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              win === k
                ? 'border-grove-accent bg-grove-accent/15 text-grove-text'
                : 'border-grove-border text-grove-text-muted hover:text-grove-text'
            }`}
          >
            {WINDOW_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Pageviews" value={stats.pageviews} sub={guestSub} />
        <StatTile label="Unique visitors" value={stats.uniqueVisitors} />
        <StatTile label="Guest entries" value={stats.guestEntries} />
        <StatTile label="CTA clicks" value={stats.clicks} />
      </div>

      {/* Visit-shaped metrics — "how many people and how deep did they go",
          which raw hit counts can't answer. Hidden for the all-time window,
          where only cheap COUNTs are available. */}
      {win !== 'all' && 'visits' in stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Visits"
            value={stats.visits}
            sub={stats.visits > 0 ? `${stats.pagesPerVisit} pages each` : undefined}
          />
          <StatTile label="Bounce rate" value={stats.bounceRate} sub="% seeing one page" />
          <StatTile label="New visitors" value={stats.newVisitors} />
          <StatTile label="Returning" value={stats.returningVisitors} />
        </div>
      )}

      {/* 30-day trend */}
      <div className="bg-grove-surface border border-grove-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-grove-text mb-3">Pageviews — last 30 days</h3>
        <TrendBars points={data.dailyPageviews} />
      </div>

      {/* Top paths + clicks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RankedList
          title="Top pages (30d)"
          rows={data.topPaths.map((p) => ({ label: p.path, value: p.views }))}
          emptyLabel="No pageviews recorded yet."
        />
        <RankedList
          title="Top clicked CTAs (30d)"
          rows={data.topClicks.map((c) => ({ label: c.target, value: c.clicks }))}
          emptyLabel="No CTA clicks recorded yet."
        />
      </div>

      {/* Who and where from — the question that prompted analytics in the
          first place. All four are 30-day windows regardless of the selector,
          since these need volume to be meaningful. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RankedList
          title="Where visitors came from (30d)"
          rows={(data.topReferrers ?? []).map((r) => ({ label: r.label, value: r.count }))}
          emptyLabel="No referrer data yet."
        />
        <RankedList
          title="Countries (30d)"
          rows={(data.topCountries ?? []).map((r) => ({ label: r.label, value: r.count }))}
          emptyLabel="No country data yet."
        />
        <RankedList
          title="Devices (30d)"
          rows={(data.devices ?? []).map((r) => ({ label: r.label, value: r.count }))}
          emptyLabel="No device data yet."
        />
        <RankedList
          title="Member vs guest vs anonymous (30d)"
          rows={(data.viewers ?? []).map((r) => ({ label: r.label, value: r.count }))}
          emptyLabel="No viewer data yet."
        />
      </div>

      <div className="text-[11px] text-grove-text-dim text-center space-y-1">
        <p>
          First-party, self-hosted analytics · generated {new Date(data.generatedAt).toLocaleString()}
          {health?.lastEventAt && ` · last event ${new Date(health.lastEventAt).toLocaleString()}`}
        </p>
        {/* State plainly what is and isn't kept — this is the answer to "what
            are you collecting about me" without reading the source. */}
        <p>
          Stored: page path, referring site’s host, country, device size bucket, and an
          anonymous per-browser id. Not stored: IP addresses, user-agent strings, full
          referring URLs, or any tracking cookie.
        </p>
      </div>
    </div>
  );
}
