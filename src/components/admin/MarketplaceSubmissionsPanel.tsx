'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface MaterialFile {
  url: string;
  name: string;
  type?: string;
  size?: number;
}

interface Submission {
  id: number;
  name: string;
  email: string | null;
  phase: string;
  title: string;
  pitch: string;
  problem: string | null;
  audience: string | null;
  angle: string | null;
  takeaway: string | null;
  mvp: string | null;
  sharpenedPitch: string | null;
  materialsUrl: string | null;
  materialFiles: MaterialFile[] | null;
  imageUrl: string | null;
  links: string | null;
  targetSessionDate: string | null;
  submitterUserId: string | null;
  status: string;
  createdAt: string;
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; rows: Submission[] };

export function MarketplaceSubmissionsPanel() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/marketplace/submissions', { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState({ kind: 'error', message: `Failed to load submissions (${r.status})` });
          return;
        }
        const data = (await r.json()) as { submissions: Submission[] };
        setState({ kind: 'ok', rows: data.submissions ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Failed to load submissions' });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.kind === 'loading') {
    return <p className="text-sm text-grove-text-muted italic py-8 text-center">Loading…</p>;
  }
  if (state.kind === 'error') {
    return <p role="alert" className="text-sm text-red-400 py-8 text-center">{state.message}</p>;
  }
  if (state.rows.length === 0) {
    return (
      <p className="text-sm text-grove-text-muted italic py-8 text-center">
        No marketplace submissions yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-grove-border text-left text-grove-text-muted">
            <th className="py-2 pr-3 font-medium">Created</th>
            <th className="py-2 pr-3 font-medium">Phase</th>
            <th className="py-2 pr-3 font-medium">Title</th>
            <th className="py-2 pr-3 font-medium">Submitter</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Materials</th>
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <React.Fragment key={row.id}>
                <tr
                  className="border-b border-grove-border/50 hover:bg-grove-surface cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                >
                  <td className="py-2 pr-3 text-grove-text-muted whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${
                      row.phase === 'idea' ? 'bg-grove-accent/20 text-grove-accent' : 'bg-grove-green/20 text-grove-green'
                    }`}>
                      {row.phase}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-medium">{row.title}</td>
                  <td className="py-2 pr-3 text-grove-text-muted">
                    {row.name}
                    {row.email && <span className="block text-xs">{row.email}</span>}
                  </td>
                  <td className="py-2 pr-3 text-grove-text-muted">{row.status}</td>
                  <td className="py-2 pr-3 text-grove-text-muted text-xs">
                    {row.imageUrl && <span title="banner">🖼</span>}{' '}
                    {row.materialsUrl && <span title="link">🔗</span>}{' '}
                    {(row.materialFiles?.length ?? 0) > 0 && (
                      <span title="files">📎 {row.materialFiles!.length}</span>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-grove-border/50 bg-grove-surface/40">
                    <td colSpan={6} className="px-3 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          {row.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.imageUrl}
                              alt="Banner"
                              className="w-full rounded-md border border-grove-border"
                            />
                          )}
                          <div>
                            <p className="text-xs uppercase tracking-wider text-grove-text-muted">Description</p>
                            <p className="mt-1 whitespace-pre-wrap">{row.pitch}</p>
                          </div>
                          {row.materialsUrl && (
                            <div>
                              <p className="text-xs uppercase tracking-wider text-grove-text-muted">Link</p>
                              <a href={row.materialsUrl} target="_blank" rel="noreferrer"
                                className="text-grove-accent hover:underline break-all">
                                {row.materialsUrl}
                              </a>
                            </div>
                          )}
                          {(row.materialFiles?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-xs uppercase tracking-wider text-grove-text-muted">Files</p>
                              <ul className="mt-1 space-y-1">
                                {row.materialFiles!.map((f) => (
                                  <li key={f.url}>
                                    <a href={f.url} target="_blank" rel="noreferrer"
                                      className="text-grove-accent hover:underline">{f.name}</a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {row.targetSessionDate && (
                            <p className="text-xs text-grove-text-muted">
                              Target session: {row.targetSessionDate}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 text-sm">
                          <p className="text-xs uppercase tracking-wider text-grove-text-muted">Framing scaffolding</p>
                          {row.problem && <Field label="Problem" value={row.problem} />}
                          {row.audience && <Field label="Audience" value={row.audience} />}
                          {row.angle && <Field label="Angle" value={row.angle} />}
                          {row.takeaway && <Field label="Takeaway" value={row.takeaway} />}
                          {row.mvp && <Field label="MVP" value={row.mvp} />}
                          {!row.problem && !row.audience && !row.angle && !row.takeaway && !row.mvp && (
                            <p className="text-grove-text-muted italic">
                              No internal scaffolding captured (submitter wrote description directly).
                            </p>
                          )}
                          {row.submitterUserId && (
                            <p className="text-xs text-grove-text-muted pt-2">
                              User ID: {row.submitterUserId}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-grove-text-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
