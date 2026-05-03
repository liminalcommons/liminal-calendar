/**
 * Pure aggregation logic for /api/admin/attendance-reports — given a list
 * of (event, report) joined rows, group into per-event aggregates with
 * counts and the original rows in createdAt order.
 */

import {
  groupReportsByEvent,
  type JoinedReportRow,
} from '@/lib/attendance-reports/aggregate';

const sampleRows: JoinedReportRow[] = [
  {
    reportId: 1,
    eventId: 5,
    eventTitle: 'Stewards Circle',
    eventStartsAt: '2026-04-04T18:00:00Z',
    reporterId: 'u-1',
    reporterName: 'A',
    eventHappened: true,
    hostPresent: true,
    note: null,
    createdAt: '2026-04-05T01:00:00Z',
  },
  {
    reportId: 2,
    eventId: 5,
    eventTitle: 'Stewards Circle',
    eventStartsAt: '2026-04-04T18:00:00Z',
    reporterId: 'u-2',
    reporterName: 'B',
    eventHappened: true,
    hostPresent: true,
    note: 'great',
    createdAt: '2026-04-05T02:00:00Z',
  },
  {
    reportId: 3,
    eventId: 5,
    eventTitle: 'Stewards Circle',
    eventStartsAt: '2026-04-04T18:00:00Z',
    reporterId: 'u-3',
    reporterName: 'C',
    eventHappened: false,
    hostPresent: false,
    note: null,
    createdAt: '2026-04-05T03:00:00Z',
  },
  {
    reportId: 4,
    eventId: 7,
    eventTitle: 'Drum Circle',
    eventStartsAt: '2026-04-10T18:00:00Z',
    reporterId: 'u-4',
    reporterName: 'D',
    eventHappened: false,
    hostPresent: false,
    note: 'no host',
    createdAt: '2026-04-11T00:00:00Z',
  },
];

describe('groupReportsByEvent', () => {
  it('returns an empty array when no rows are provided', () => {
    expect(groupReportsByEvent([])).toEqual([]);
  });

  it('groups rows by eventId, preserving event metadata', () => {
    const result = groupReportsByEvent(sampleRows);
    expect(result).toHaveLength(2);
    const e5 = result.find((g) => g.eventId === 5)!;
    const e7 = result.find((g) => g.eventId === 7)!;
    expect(e5).toBeDefined();
    expect(e7).toBeDefined();
    expect(e5.eventTitle).toBe('Stewards Circle');
    expect(e7.eventTitle).toBe('Drum Circle');
  });

  it('counts totalReports, happenedYes, hostPresentYes per event', () => {
    const result = groupReportsByEvent(sampleRows);
    const e5 = result.find((g) => g.eventId === 5)!;
    expect(e5.totalReports).toBe(3);
    expect(e5.happenedYes).toBe(2);
    expect(e5.hostPresentYes).toBe(2);
    const e7 = result.find((g) => g.eventId === 7)!;
    expect(e7.totalReports).toBe(1);
    expect(e7.happenedYes).toBe(0);
    expect(e7.hostPresentYes).toBe(0);
  });

  it('sorts events by most recent eventStartsAt (newest first)', () => {
    const result = groupReportsByEvent(sampleRows);
    expect(result[0].eventId).toBe(7); // Apr 10 > Apr 4
    expect(result[1].eventId).toBe(5);
  });

  it('keeps reports within an event sorted by createdAt ascending', () => {
    const result = groupReportsByEvent(sampleRows);
    const e5 = result.find((g) => g.eventId === 5)!;
    expect(e5.reports.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('shapes each report with id, reporter, answers, note, createdAt', () => {
    const result = groupReportsByEvent(sampleRows);
    const e5 = result.find((g) => g.eventId === 5)!;
    expect(e5.reports[0]).toEqual({
      id: 1,
      reporterId: 'u-1',
      reporterName: 'A',
      eventHappened: true,
      hostPresent: true,
      note: null,
      createdAt: '2026-04-05T01:00:00Z',
    });
  });
});
