import { desc, eq } from 'drizzle-orm';
import { attendanceReports, events } from '@/lib/db/schema';

export interface JoinedReportRow {
  reportId: number;
  eventId: number;
  eventTitle: string;
  eventStartsAt: string;
  reporterId: string;
  reporterName: string;
  eventHappened: boolean;
  hostPresent: boolean;
  note: string | null;
  createdAt: string;
}

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

/**
 * Pure grouping — no DB. Used by both the route handler and tests.
 * Sorted by eventStartsAt desc (newest event first); reports within an
 * event are sorted by createdAt ascending (chronological).
 */
export function groupReportsByEvent(
  rows: JoinedReportRow[],
): AggregatedEvent[] {
  const map = new Map<number, AggregatedEvent>();
  for (const r of rows) {
    let group = map.get(r.eventId);
    if (!group) {
      group = {
        eventId: r.eventId,
        eventTitle: r.eventTitle,
        eventStartsAt: r.eventStartsAt,
        totalReports: 0,
        happenedYes: 0,
        hostPresentYes: 0,
        reports: [],
      };
      map.set(r.eventId, group);
    }
    group.totalReports += 1;
    if (r.eventHappened) group.happenedYes += 1;
    if (r.hostPresent) group.hostPresentYes += 1;
    group.reports.push({
      id: r.reportId,
      reporterId: r.reporterId,
      reporterName: r.reporterName,
      eventHappened: r.eventHappened,
      hostPresent: r.hostPresent,
      note: r.note,
      createdAt: r.createdAt,
    });
  }
  for (const g of map.values()) {
    g.reports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return Array.from(map.values()).sort((a, b) =>
    b.eventStartsAt.localeCompare(a.eventStartsAt),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Fetch all reports + their parent event metadata, joined and aggregated.
 * Limits to 200 most recent reports to keep the admin page responsive.
 */
export async function aggregateAllReports(
  db: Db,
): Promise<AggregatedEvent[]> {
  const rows = await db
    .select({
      reportId: attendanceReports.id,
      eventId: attendanceReports.eventId,
      eventTitle: events.title,
      eventStartsAt: events.startsAt,
      reporterId: attendanceReports.reporterId,
      reporterName: attendanceReports.reporterName,
      eventHappened: attendanceReports.eventHappened,
      hostPresent: attendanceReports.hostPresent,
      note: attendanceReports.note,
      createdAt: attendanceReports.createdAt,
    })
    .from(attendanceReports)
    .innerJoin(events, eq(events.id, attendanceReports.eventId))
    .orderBy(desc(attendanceReports.createdAt))
    .limit(200);
  // Drizzle returns Date objects for timestamp columns — normalise to ISO
  // for the wire format consistency that the rest of the route relies on.
  const normalised: JoinedReportRow[] = rows.map(
    (r: Record<string, unknown>) => ({
      reportId: r.reportId as number,
      eventId: r.eventId as number,
      eventTitle: r.eventTitle as string,
      eventStartsAt:
        r.eventStartsAt instanceof Date
          ? r.eventStartsAt.toISOString()
          : (r.eventStartsAt as string),
      reporterId: r.reporterId as string,
      reporterName: r.reporterName as string,
      eventHappened: r.eventHappened as boolean,
      hostPresent: r.hostPresent as boolean,
      note: (r.note as string | null) ?? null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : (r.createdAt as string),
    }),
  );
  return groupReportsByEvent(normalised);
}
