'use client';

/**
 * Admin analytics dashboard — traffic, guest counts, and clicks from the
 * first-party analytics_events table. Read-only; styled to match the other
 * admin panels (grove tokens, no external chart lib — a small inline bar
 * sparkline keeps this self-contained).
 */

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface WindowStats {
  pageviews: number;
  uniqueVisitors: number;
  guestEntries: number;
  clicks: number;
  guestPageviews: number;
}

interface AnalyticsData {
  generatedAt: string;
  allTime: { pageviews: number; uniqueVisitors: number; guestEntries: number; clicks: number };
  windows: { day: WindowStats; week: WindowStats; month: WindowStats };
  topPaths: { path: string; views: number }[];
  topClicks: { target: string; clicks: number }[];
  dailyPageviews: { date: string; views: number; guestViews: number }[];
}

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

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/analytics', { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState({ kind: 'error', message: 'Failed to load analytics' });
          return;
        }
        setState({ kind: 'ok', data: (await r.json()) as AnalyticsData });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Failed to load analytics' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-grove-text-muted italic py-8 text-center">Loading…</p>;
  }
  if (state.kind === 'error') {
    return <p role="alert" className="text-sm text-red-400 py-8 text-center">{state.message}</p>;
  }

  const { data } = state;
  const stats =
    win === 'all'
      ? { ...data.allTime, guestPageviews: 0 }
      : data.windows[win];
  const guestSub = win === 'all' ? undefined : `${stats.guestPageviews.toLocaleString()} guest views`;

  return (
    <div className="space-y-6">
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

      <p className="text-[11px] text-grove-text-dim text-center">
        First-party, cookieless traffic analytics · generated {new Date(data.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
