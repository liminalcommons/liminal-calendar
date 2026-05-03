'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

export interface AggregatedReportItem {
  id: number;
  reporterId: string;
  reporterName: string;
  eventHappened: boolean;
  hostPresent: boolean;
  note: string | null;
  createdAt: string;
}

export interface AggregatedEvent {
  eventId: number;
  eventTitle: string;
  eventStartsAt: string;
  totalReports: number;
  happenedYes: number;
  hostPresentYes: number;
  reports: AggregatedReportItem[];
}

interface Props {
  events: AggregatedEvent[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="text-grove-accent-deep">Yes</span>
  ) : (
    <span className="text-red-400">No</span>
  );
}

export function AttendanceReportsTable({ events }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (events.length === 0) {
    return (
      <p className="text-sm text-grove-text-muted italic py-8 text-center">
        No attendance reports yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((e) => {
        const isOpen = expanded === e.eventId;
        return (
          <li
            key={e.eventId}
            className="bg-grove-surface border border-grove-border rounded-lg overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : e.eventId)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-grove-border/10 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-medium text-grove-text">
                    {e.eventTitle}
                  </span>
                  <span className="text-xs text-grove-text-muted">
                    {formatDate(e.eventStartsAt)}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-grove-text-muted mt-1">
                  <span>
                    Happened:{' '}
                    <span className="text-grove-text font-medium">
                      {e.happenedYes} / {e.totalReports}
                    </span>
                  </span>
                  <span>
                    Host present:{' '}
                    <span className="text-grove-text font-medium">
                      {e.hostPresentYes} / {e.totalReports}
                    </span>
                  </span>
                </div>
              </div>
              <Link
                href={`/events/${e.eventId}`}
                className="text-grove-text-muted hover:text-grove-text inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-grove-border/20"
                onClick={(ev) => ev.stopPropagation()}
                aria-label={`Open event ${e.eventTitle}`}
              >
                <ExternalLink size={12} />
                open
              </Link>
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && (
              <div className="border-t border-grove-border bg-grove-bg/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-grove-border/40 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-grove-text-muted uppercase tracking-wider">
                        Reporter
                      </th>
                      <th className="px-4 py-2 text-xs font-medium text-grove-text-muted uppercase tracking-wider">
                        Happened?
                      </th>
                      <th className="px-4 py-2 text-xs font-medium text-grove-text-muted uppercase tracking-wider">
                        Host?
                      </th>
                      <th className="px-4 py-2 text-xs font-medium text-grove-text-muted uppercase tracking-wider">
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.reports.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-grove-border/20 last:border-0"
                      >
                        <td className="px-4 py-2 text-grove-text">
                          {r.reporterName}
                        </td>
                        <td className="px-4 py-2">
                          <YesNo value={r.eventHappened} />
                        </td>
                        <td className="px-4 py-2">
                          <YesNo value={r.hostPresent} />
                        </td>
                        <td className="px-4 py-2 text-grove-text-muted">
                          {r.note ?? <span className="italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
