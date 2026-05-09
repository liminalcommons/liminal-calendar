import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, type Event } from '@/lib/db/schema';
import { getCurrentMember } from '@/lib/auth/get-current-member';
import {
  upsertAttendanceReport,
  getAttendanceReportForUser,
  REPORT_NOTE_MAX_LENGTH,
} from '@/lib/attendance-reports/repo';
import { eventEndedAt, type EventTimeFields } from '@/lib/event-time';
import { fanoutAttendanceNegative } from '@/lib/notifications/fanout';
import {
  visibleEventsForUserCondition,
  publicOnlyEventsCondition,
} from '@/lib/events/visibility';

// Visibility filter applied — this route is post-event reporting and the
// visibility predicate (which covers the RSVP'd-user case) is the correct
// gate: a member who never engaged with the event cannot report on it.
async function findEvent(
  numId: number,
  userId: string | undefined,
): Promise<(EventTimeFields & Partial<Event>) | null> {
  const visibilityCond = userId
    ? visibleEventsForUserCondition(userId)
    : publicOnlyEventsCondition();
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.id, numId), visibilityCond));
  return (rows[0] as (EventTimeFields & Partial<Event>) | undefined) ?? null;
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

  const userId = member.hyloId ?? member.clerkId ?? undefined;
  const event = await findEvent(numId, userId);
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
      memberId: member.id,
      reporterName: member.name,
      eventHappened,
      hostPresent,
      note: normalizedNote,
    });

    // C2 fan-out: notify the host when a negative report comes in. Best-effort.
    // Skips when both axes are positive, when the host is reporting on their
    // own event, or when the event row lacks a creatorId (defensive).
    if ((!eventHappened || !hostPresent) && event.creatorId) {
      try {
        await fanoutAttendanceNegative(
          db,
          event as Event,
          { eventHappened, hostPresent },
          { id: reporterId, name: member.name },
        );
      } catch (fanoutErr) {
        console.error(
          '[POST /api/events/[id]/attendance-report] fanout failed',
          fanoutErr,
        );
      }
    }

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
