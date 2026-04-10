import { format, toZonedTime } from 'date-fns-tz';
import { createHmac } from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://calendar.castalia.one';
const HMAC_SECRET = process.env.CRON_SECRET || 'dev-secret';

export type ReminderType = '24hr' | '1hr' | '15min';

interface ReminderEvent {
  id: number;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
  timezone: string;
}

interface ReminderRecipient {
  userId: string;
  email: string;
  timezone: string;
}

function stopReminderToken(eventId: number, userId: string): string {
  return createHmac('sha256', HMAC_SECRET)
    .update(`${eventId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

function stopReminderUrl(eventId: number, userId: string): string {
  const token = stopReminderToken(eventId, userId);
  return `${BASE_URL}/api/notifications/stop-reminder?eventId=${eventId}&userId=${encodeURIComponent(userId)}&token=${token}`;
}

export function verifyStopToken(eventId: number, userId: string, token: string): boolean {
  return stopReminderToken(eventId, userId) === token;
}

function formatEventTime(date: Date, tz: string): string {
  try {
    const zonedDate = toZonedTime(date, tz);
    return format(zonedDate, 'EEEE, MMMM d · h:mm a zzz', { timeZone: tz });
  } catch {
    return date.toISOString();
  }
}

function extractMeetingLink(event: ReminderEvent): string | null {
  const text = `${event.location || ''} ${event.description || ''}`;
  const match = text.match(/https?:\/\/[^\s<"]+/);
  return match ? match[0] : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReminderEmail(
  type: ReminderType,
  event: ReminderEvent,
  recipient: ReminderRecipient,
): { subject: string; html: string } {
  const tz = recipient.timezone || event.timezone || 'UTC';
  const timeStr = formatEventTime(event.startsAt, tz);
  const meetingLink = extractMeetingLink(event);
  const eventUrl = `${BASE_URL}/events/${event.id}`;
  const stopUrl = stopReminderUrl(event.id, recipient.userId);

  const subjects: Record<ReminderType, string> = {
    '24hr': `Tomorrow: ${event.title}`,
    '1hr': `${event.title} starts in 1 hour`,
    '15min': `${event.title} starting soon!`,
  };

  const subject = subjects[type];

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;margin:0;padding:0;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">

  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;">Liminal Commons</span>
  </div>

  <h1 style="font-size:20px;font-weight:600;color:#e8dcc8;margin:0 0 8px 0;">${escapeHtml(event.title)}</h1>
  <p style="font-size:14px;color:#a08c6e;margin:0 0 20px 0;">${timeStr}</p>

  ${event.location ? `<p style="font-size:14px;color:#c4935a;margin:0 0 8px 0;">${escapeHtml(event.location)}</p>` : ''}

  ${meetingLink && type !== '24hr' ? `
  <div style="margin:20px 0;">
    <a href="${meetingLink}" style="display:inline-block;padding:12px 24px;background:#c4935a;color:#1a1612;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      ${type === '15min' ? 'Join Now' : 'Join Meeting'}
    </a>
  </div>` : ''}

  <div style="margin:20px 0;">
    <a href="${eventUrl}" style="font-size:13px;color:#c4935a;text-decoration:underline;">View event details</a>
  </div>

  <hr style="border:none;border-top:1px solid #2a2520;margin:24px 0;">
  <p style="font-size:11px;color:#6b5f4f;text-align:center;">
    <a href="${stopUrl}" style="color:#6b5f4f;text-decoration:underline;">Stop reminders for this event</a>
  </p>

</div></body></html>`;

  return { subject, html };
}
