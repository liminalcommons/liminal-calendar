'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import {
  AttendanceReportsTable,
  type AggregatedEvent,
} from './AttendanceReportsTable';

type FetchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; events: AggregatedEvent[] };

export function ReportsPanel() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/attendance-reports', { method: 'GET' })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setState({ kind: 'error', message: 'Failed to load reports' });
          return;
        }
        const data = (await r.json()) as { events: AggregatedEvent[] };
        setState({ kind: 'ok', events: data.events ?? [] });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: 'error', message: 'Failed to load reports' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <p className="text-sm text-grove-text-muted italic py-8 text-center">
        Loading…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p
        role="alert"
        className="text-sm text-red-400 py-8 text-center"
      >
        {state.message}
      </p>
    );
  }
  return <AttendanceReportsTable events={state.events} />;
}
