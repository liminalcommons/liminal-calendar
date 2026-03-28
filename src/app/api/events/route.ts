import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getUserRole, canCreateEvents } from '@/lib/auth-helpers';
import { getEvents, createEvent, LIMINAL_COMMONS_GROUP_ID } from '@/lib/hylo-client';
import { hyloEventToDisplayEvent } from '@/lib/display-event';

export async function GET() {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = (session as any).accessToken as string;
    const events = await getEvents(token, LIMINAL_COMMONS_GROUP_ID);
    const displayEvents = events.map(hyloEventToDisplayEvent);
    return NextResponse.json(displayEvents);
  } catch (err) {
    console.error('[GET /api/events]', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = getUserRole(session);
  if (!canCreateEvents(role)) {
    return NextResponse.json({ error: 'Forbidden: only hosts and admins can create events' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, startTime, endTime, details, timezone, location, imageUrl } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!startTime || typeof startTime !== 'string') {
    return NextResponse.json({ error: 'startTime is required' }, { status: 400 });
  }
  if (!endTime || typeof endTime !== 'string') {
    return NextResponse.json({ error: 'endTime is required' }, { status: 400 });
  }

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'startTime is not a valid date' }, { status: 400 });
  }
  if (isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'endTime is not a valid date' }, { status: 400 });
  }

  try {
    const token = (session as any).accessToken as string;
    const created = await createEvent(token, LIMINAL_COMMONS_GROUP_ID, {
      title: (title as string).trim(),
      startTime: startDate,
      endTime: endDate,
      details: typeof details === 'string' ? details : undefined,
      timezone: typeof timezone === 'string' ? timezone : undefined,
      location: typeof location === 'string' ? location : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
    });
    return NextResponse.json(hyloEventToDisplayEvent(created), { status: 201 });
  } catch (err) {
    console.error('[POST /api/events]', err);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
