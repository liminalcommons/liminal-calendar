'use client';

/**
 * Shown when an admin panel's backing table doesn't exist.
 *
 * Migrations run on every cold start and are idempotent, but a statement that
 * fails against live data used to abort the rest of the chain — which is how
 * newsletter_subscribers and analytics_events ended up missing in production
 * while older tables were fine. This gives the admin the fix (re-run
 * migrations) and, more importantly, the diagnosis: the exact statements that
 * failed, so a genuine data problem behind a UNIQUE constraint is visible
 * rather than inferred.
 */

import { useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface RepairFailure {
  statement: string;
  error: string;
}

interface RepairResult {
  success: boolean;
  message: string;
  failures: RepairFailure[];
  tables: Record<string, boolean>;
  missing: string[];
  repaired: boolean;
}

type State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: RepairResult }
  | { kind: 'error'; message: string };

export function SchemaRepairBanner({
  table,
  onRepaired,
}: {
  /** The table this panel needs, named so the admin knows what's missing. */
  table: string;
  /** Called after a run that left no expected table missing. */
  onRepaired?: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const repair = async () => {
    setState({ kind: 'running' });
    try {
      const res = await apiFetch('/api/admin/schema-repair', { method: 'POST' });
      if (!res.ok) {
        setState({ kind: 'error', message: `Repair failed (HTTP ${res.status})` });
        return;
      }
      const result = (await res.json()) as RepairResult;
      setState({ kind: 'done', result });
      if (result.repaired) onRepaired?.();
    } catch {
      setState({ kind: 'error', message: 'Repair request failed' });
    }
  };

  return (
    <div role="alert" className="bg-red-950/40 border border-red-700/50 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-red-300">
          The <code className="px-1 rounded bg-black/30">{table}</code> table doesn’t exist.
        </p>
        <p className="text-xs text-red-200/80 mt-1">
          This panel has nothing to read. It happens when a migration statement fails against
          existing data — everything declared after it gets skipped. Re-running migrations is
          safe and idempotent.
        </p>
      </div>

      <button
        onClick={repair}
        disabled={state.kind === 'running'}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-600/60 text-red-200 hover:bg-red-900/40 disabled:opacity-50"
      >
        {state.kind === 'running' ? 'Repairing…' : 'Repair schema'}
      </button>

      {state.kind === 'error' && (
        <p className="text-xs text-red-300">{state.message}</p>
      )}

      {state.kind === 'done' && (
        <div className="space-y-2">
          <p className={`text-xs ${state.result.repaired ? 'text-emerald-400' : 'text-red-300'}`}>
            {state.result.repaired
              ? 'Schema repaired — every expected table is present. Reload to see data.'
              : `Still missing: ${state.result.missing.join(', ') || 'none'}`}
          </p>

          {state.result.failures.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-200/90">
                {state.result.failures.length} statement(s) failed — these need a data fix
              </summary>
              <ul className="mt-2 space-y-2">
                {state.result.failures.map((f, i) => (
                  <li key={i} className="rounded bg-black/30 p-2">
                    <code className="block text-[10px] text-red-200/90 break-all">{f.statement}</code>
                    <span className="block text-[10px] text-red-300/80 mt-1">{f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
