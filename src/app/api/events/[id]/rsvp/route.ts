import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { respondToEvent, getEventAttendees } from '@/lib/hylo-client';

const VALID_RESPONSES = ['yes', 'interested', 'no'] as const;
type ValidResponse = (typeof VALID_RESPONSES)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || !(session as any).accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { response } = body as Record<string, unknown>;
  if (!response || !VALID_RESPONSES.includes(response as ValidResponse)) {
    return NextResponse.json(
      { error: `response must be one of: ${VALID_RESPONSES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const token = (session as any).accessToken as string;
    await respondToEvent(token, id, response as ValidResponse);
    return NextResponse.json({ success: true, response });
  } catch (err) {
    console.error('[POST /api/events/[id]/rsvp]', err);
    return NextResponse.json({ error: 'Failed to submit RSVP' }, { status: 500 });
  }
}

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
    const { creator, invitations } = await getEventAttendees(token, id);
    return NextResponse.json({ creator, invitations });
  } catch (err) {
    console.error('[GET /api/events/[id]/rsvp]', err);
    return NextResponse.json({ error: 'Failed to fetch attendees' }, { status: 500 });
  }
}
