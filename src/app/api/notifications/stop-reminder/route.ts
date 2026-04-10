import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rsvps, events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { verifyStopToken } from '@/lib/notifications/reminders';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId');
  const userId = request.nextUrl.searchParams.get('userId');
  const token = request.nextUrl.searchParams.get('token');

  if (!eventId || !userId || !token) {
    return new NextResponse('Missing parameters', { status: 400 });
  }

  const numEventId = parseInt(eventId, 10);
  if (isNaN(numEventId)) {
    return new NextResponse('Invalid event ID', { status: 400 });
  }

  if (!verifyStopToken(numEventId, userId, token)) {
    return new NextResponse('Invalid token', { status: 403 });
  }

  await db
    .update(rsvps)
    .set({ remindMe: false })
    .where(and(eq(rsvps.eventId, numEventId), eq(rsvps.userId, userId)));

  const [event] = await db
    .select({ title: events.title })
    .from(events)
    .where(eq(events.id, numEventId));

  const title = event?.title || 'this event';

  return new NextResponse(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
<div style="text-align:center;max-width:400px;padding:24px;">
  <p style="font-size:18px;margin:0 0 8px 0;">Reminders stopped</p>
  <p style="font-size:14px;color:#a08c6e;">You won't receive any more email reminders for <strong>${title.replace(/</g, '&lt;')}</strong>.</p>
  <a href="https://calendar.castalia.one" style="display:inline-block;margin-top:16px;color:#c4935a;text-decoration:underline;font-size:14px;">Back to calendar</a>
</div>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
