import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  upsertAttendanceReport,
  getAttendanceReportForUser,
  REPORT_NOTE_MAX_LENGTH,
} from '@/lib/attendance-reports/repo';

interface EventTimeRow {
  // Drizzle row maps DB snake_case to camelCase, but the route's test
  // shape uses snake_case (matches the JSON wire format from /api/events/[id]).
  // Accept either at this seam to keep both layers honest.
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  starts_at?: Date | string | null;
  ends_at?: Date | string | null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

async function findEvent(numId: number): Promise<EventTimeRow | null> {
  const rows = await db.select().from(events).where(eq(events.id, numId));
  return (rows[0] as EventTimeRow | undefined) ?? null;
}

function eventEndedAt(event: EventTimeRow): number {
  const ends = event.endsAt ?? event.ends_at ?? null;
  const starts = event.startsAt ?? event.starts_at ?? null;
  if (ends) return new Date(ends as Date | string).getTime();
  // Fallback: treat events without ends_at as ending 1h after start.
  if (starts) return new Date(starts as Date | string).getTime() + ONE_HOUR_MS;
  return 0;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { eventHappened, hostPresent, note } = body as {
    eventHappened?: unknown;
    hostPresent?: unknown;
    note?: unknown;
  };
  if (typeof eventHappened !== 'boolean') {
    return NextResponse.json(
      { error: 'eventHappened must be a boolean' },
      { status: 400 },
    );
  }
  if (typeof hostPresent !== 'boolean') {
    return NextResponse.json(
      { error: 'hostPresent must be a boolean' },
      { status: 400 },
    );
  }

  let normalizedNote: string | null = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string') {
      return NextResponse.json(
        { error: 'note must be a string' },
        { status: 400 },
      );
    }
    if (note.length > REPORT_NOTE_MAX_LENGTH) {
      return NextResponse.json(
        {
          error: `note must be ${REPORT_NOTE_MAX_LENGTH} characters or fewer`,
        },
        { status: 400 },
      );
    }
    normalizedNote = note;
  }

  const event = await findEvent(numId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (Date.now() < eventEndedAt(event)) {
    return NextResponse.json(
      {
        error:
          'Reports are only allowed after the event has ended.',
      },
      { status: 400 },
    );
  }

  const reporterId = member.hyloId ?? member.clerkId ?? 'unknown';

  try {
    const result = await upsertAttendanceReport(db, {
      eventId: numId,
      reporterId,
      reporterName: member.name,
      eventHappened,
      hostPresent,
      note: normalizedNote,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/events/[id]/attendance-report]', err);
    return NextResponse.json(
      { error: 'Failed to save report' },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const member = await getCurrentMember(db);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id, 10);
  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const reporterId = member.hyloId ?? member.clerkId ?? 'unknown';
  try {
    const row = await getAttendanceReportForUser(db, numId, reporterId);
    return NextResponse.json({ report: row ?? null });
  } catch (err) {
    console.error('[GET /api/events/[id]/attendance-report]', err);
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 },
    );
  }
}
