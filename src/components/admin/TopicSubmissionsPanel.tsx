'use client';

import { Fragment, useEffect, useState } from 'react';

interface TopicRow {
  id: number;
  submitterId: string;
  submitterName: string;
  submitterEmail: string | null;
  title: string;
  description: string;
  formatHint: string | null;
  materialsUrl: string | null;
  imageUrl: string | null;
  hook: string | null;
  audience: string | null;
  takeaway: string | null;
  status: string;
  targetSessionDate: string | null;
  createdAt: string;
}

export function TopicSubmissionsPanel() {
  const [rows, setRows] = useState<TopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/topics/submissions');
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Load failed (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) setRows(data.submissions ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return <p className="text-sm text-grove-text-muted">Loading Topics…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (rows.length === 0)
    return (
      <p className="text-sm text-grove-text-muted">
        No Topic submissions yet.
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-grove-border text-left text-xs uppercase tracking-wider text-grove-text-muted">
            <th className="py-2 pr-3">Created</th>
            <th className="py-2 pr-3">Title</th>
            <th className="py-2 pr-3">Submitter</th>
            <th className="py-2 pr-3">Format</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="cursor-pointer border-b border-grove-border/50 hover:bg-grove-surface"
              >
                <td className="py-2 pr-3 text-xs text-grove-text-muted">
                  {new Date(r.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="py-2 pr-3 font-medium text-grove-text">{r.title}</td>
                <td className="py-2 pr-3 text-grove-text-muted">
                  {r.submitterName}
                </td>
                <td className="py-2 pr-3 text-grove-text-muted">
                  {r.formatHint ?? '—'}
                </td>
                <td className="py-2 pr-3 text-grove-accent">{r.status}</td>
              </tr>
              {expanded === r.id && (
                <tr>
                  <td colSpan={5} className="bg-grove-surface px-3 py-4">
                    <div className="space-y-3 text-sm text-grove-text">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-grove-text-muted">
                          Description
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{r.description}</p>
                      </div>
                      {r.hook && (
                        <Detail label="Hook (internal)" value={r.hook} />
                      )}
                      {r.audience && (
                        <Detail label="Audience (internal)" value={r.audience} />
                      )}
                      {r.takeaway && (
                        <Detail label="Takeaway (internal)" value={r.takeaway} />
                      )}
                      {r.materialsUrl && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-grove-text-muted">
                            Materials
                          </div>
                          <a
                            href={r.materialsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-grove-accent hover:underline"
                          >
                            {r.materialsUrl}
                          </a>
                        </div>
                      )}
                      {r.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.imageUrl}
                          alt={r.title}
                          className="max-w-md rounded-md border border-grove-border"
                        />
                      )}
                      {r.submitterEmail && (
                        <div className="text-xs text-grove-text-muted">
                          Contact: {r.submitterEmail}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-grove-text-muted">
        {label}
      </div>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
