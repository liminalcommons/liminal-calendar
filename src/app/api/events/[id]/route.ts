import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getUserRole, canEditEvent, canDeleteEvent } from '@/lib/auth-helpers';
import { getEvent, updateEvent, deleteEvent } from '@/lib/hylo-client';
import { hyloEventToDisplayEvent } from '@/lib/display-event';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const token = (session as any).accessToken as string;
    const event = await getEvent(token, id);
    return NextResponse.json(hyloEventToDisplayEvent(event));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    console.error('[GET /api/events/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const token = (session as any).accessToken as string;
  const role = getUserRole(session);

  // Fetch the event first to check ownership
  let event;
  try {
    event = await getEvent(token, id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    console.error('[PATCH /api/events/[id]] fetch', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }

  const isCreator = event.creator.id === (session.user as any)?.hyloId;
  if (!canEditEvent(role, isCreator)) {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions to edit this event' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates = body as Record<string, unknown>;
  const updatePayload: Parameters<typeof updateEvent>[2] = {};

  if (typeof updates.title === 'string') updatePayload.title = updates.title;
  if (typeof updates.details === 'string') updatePayload.details = updates.details;
  if (typeof updates.startTime === 'string') updatePayload.startTime = new Date(updates.startTime);
  if (typeof updates.endTime === 'string') updatePayload.endTime = new Date(updates.endTime);
  if (typeof updates.timezone === 'string') updatePayload.timezone = updates.timezone;
  if (typeof updates.location === 'string') updatePayload.location = updates.location;
  if (typeof updates.imageUrl === 'string') updatePayload.imageUrl = updates.imageUrl;

  try {
    const updated = await updateEvent(token, id, updatePayload);
    return NextResponse.json(hyloEventToDisplayEvent(updated));
  } catch (err) {
    console.error('[PATCH /api/events/[id]] update', err);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const token = (session as any).accessToken as string;
  const role = getUserRole(session);

  // Fetch the event first to check ownership
  let event;
  try {
    event = await getEvent(token, id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    console.error('[DELETE /api/events/[id]] fetch', err);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }

  const isCreator = event.creator.id === (session.user as any)?.hyloId;
  if (!canDeleteEvent(role, isCreator)) {
    return NextResponse.json({ error: 'Forbidden: insufficient permissions to delete this event' }, { status: 403 });
  }

  try {
    await deleteEvent(token, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/events/[id]] delete', err);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
