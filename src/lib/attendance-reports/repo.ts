import { and, eq, desc } from 'drizzle-orm';
import {
  attendanceReports,
  type AttendanceReport,
} from '@/lib/db/schema';

export interface UpsertReportParams {
  eventId: number;
  reporterId: string;
  reporterName: string;
  eventHappened: boolean;
  hostPresent: boolean;
  note: string | null;
}

export type UpsertReportResult =
  | { action: 'inserted'; reportId: number }
  | { action: 'updated'; reportId: number };

export const REPORT_NOTE_MAX_LENGTH = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function clipNote(note: string | null): string | null {
  if (note === null) return null;
  if (note.length <= REPORT_NOTE_MAX_LENGTH) return note;
  return note.slice(0, REPORT_NOTE_MAX_LENGTH);
}

export async function upsertAttendanceReport(
  db: Db,
  p: UpsertReportParams,
): Promise<UpsertReportResult> {
  const note = clipNote(p.note);
  const [existing] = await db
    .select()
    .from(attendanceReports)
    .where(
      and(
        eq(attendanceReports.eventId, p.eventId),
        eq(attendanceReports.reporterId, p.reporterId),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(attendanceReports)
      .set({
        reporterName: p.reporterName,
        eventHappened: p.eventHappened,
        hostPresent: p.hostPresent,
        note,
        updatedAt: new Date(),
      })
      .where(eq(attendanceReports.id, existing.id))
      .returning();
    return { action: 'updated', reportId: row?.id ?? existing.id };
  }

  const [row] = await db
    .insert(attendanceReports)
    .values({
      eventId: p.eventId,
      reporterId: p.reporterId,
      reporterName: p.reporterName,
      eventHappened: p.eventHappened,
      hostPresent: p.hostPresent,
      note,
    })
    .returning();
  return { action: 'inserted', reportId: row.id };
}

export async function getAttendanceReportForUser(
  db: Db,
  eventId: number,
  reporterId: string,
): Promise<AttendanceReport | undefined> {
  const [row] = await db
    .select()
    .from(attendanceReports)
    .where(
      and(
        eq(attendanceReports.eventId, eventId),
        eq(attendanceReports.reporterId, reporterId),
      ),
    )
    .limit(1);
  return row as AttendanceReport | undefined;
}

export async function listAttendanceReportsForEvent(
  db: Db,
  eventId: number,
): Promise<AttendanceReport[]> {
  const rows = await db
    .select()
    .from(attendanceReports)
    .where(eq(attendanceReports.eventId, eventId))
    .orderBy(desc(attendanceReports.createdAt));
  return rows as AttendanceReport[];
}
