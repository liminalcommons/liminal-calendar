/**
 * Email builders for booking confirmation. Pure — render subject + html
 * from event/booking details so they're testable without a Resend dep.
 *
 * Two flavors:
 *   - owner: "X booked Y with you" — shown to the host
 *   - booker: "Your Y with X is confirmed" — shown to the person who booked
 *
 * Time rendering uses the recipient's timezone when known; falls back to
 * the event's stored timezone (which the book route always sets to UTC
 * for booking-created events).
 */

import { format, toZonedTime } from 'date-fns-tz';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://liminalcalendar.com';

export type BookingEmailFlavor = 'owner' | 'booker';

export interface BookingEmailInput {
  flavor: BookingEmailFlavor;
  eventId: number;
  eventTitle: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  ownerName: string;
  bookerName: string;
  recipientTimezone: string;
  eventTimezone: string;
  /** Note the booker left at booking time. Rendered on the owner email
   * as a styled callout. Omitted from the booker email since they wrote it. */
  noteFromBooker?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEventTime(date: Date, tz: string): string {
  try {
    const zonedDate = toZonedTime(date, tz);
    return format(zonedDate, 'EEEE, MMMM d · h:mm a zzz', { timeZone: tz });
  } catch {
    return date.toISOString();
  }
}

function extractMeetingLink(location: string | null): string | null {
  if (!location) return null;
  const match = location.match(/https?:\/\/[^\s<"]+/);
  return match ? match[0] : null;
}

export function buildBookingConfirmedEmail(
  input: BookingEmailInput,
): { subject: string; html: string } {
  const tz = input.recipientTimezone || input.eventTimezone || 'UTC';
  const timeStr = formatEventTime(input.startsAt, tz);
  const meetingLink = extractMeetingLink(input.location);
  const eventUrl = `${BASE_URL}/events/${input.eventId}`;

  const subject =
    input.flavor === 'owner'
      ? `${input.bookerName} booked ${input.eventTitle}`
      : `Booked: ${input.eventTitle} with ${input.ownerName}`;

  const heading =
    input.flavor === 'owner'
      ? `${escapeHtml(input.bookerName)} booked time with you`
      : `Your time with ${escapeHtml(input.ownerName)} is booked`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;margin:0;padding:0;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">

  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;">Liminal Calendar</span>
  </div>

  <p style="font-size:13px;color:#a08c6e;margin:0 0 4px 0;">${heading}</p>
  <h1 style="font-size:20px;font-weight:600;color:#e8dcc8;margin:0 0 8px 0;">${escapeHtml(input.eventTitle)}</h1>
  <p style="font-size:14px;color:#a08c6e;margin:0 0 20px 0;">${escapeHtml(timeStr)}</p>

  ${input.location ? `<p style="font-size:14px;color:#c4935a;margin:0 0 8px 0;">${escapeHtml(input.location)}</p>` : ''}

  ${input.flavor === 'owner' && input.noteFromBooker ? `
  <div style="margin:16px 0;padding:12px 14px;background:#221c16;border-left:3px solid #c4935a;border-radius:4px;">
    <p style="font-size:11px;color:#a08c6e;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px 0;">Note from ${escapeHtml(input.bookerName)}</p>
    <p style="font-size:14px;color:#e8dcc8;margin:0;white-space:pre-wrap;">${escapeHtml(input.noteFromBooker)}</p>
  </div>` : ''}

  ${meetingLink ? `
  <div style="margin:20px 0;">
    <a href="${meetingLink}" style="display:inline-block;padding:12px 24px;background:#c4935a;color:#1a1612;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
      Open meeting room
    </a>
  </div>` : ''}

  <div style="margin:20px 0;">
    <a href="${eventUrl}" style="font-size:13px;color:#c4935a;text-decoration:underline;">View event details</a>
  </div>

  <hr style="border:none;border-top:1px solid #2a2520;margin:24px 0;">
  <p style="font-size:11px;color:#6b5f4f;text-align:center;">
    Sent by Liminal Calendar
  </p>

</div></body></html>`;

  return { subject, html };
}

export type BookingCancelledFlavor = 'host' | 'booker';

export interface BookingCancelledInput {
  flavor: BookingCancelledFlavor;
  eventId: number;
  eventTitle: string;
  startsAt: Date;
  recipientTimezone: string;
  eventTimezone: string;
  cancellerName: string;
  /** True when the recipient of this email is the one who cancelled.
   * Subject + body switch to the first person. */
  recipientIsCanceller: boolean;
  /** Optional reason the canceller gave. Rendered as a quoted callout. */
  reason?: string | null;
}

export function buildBookingCancelledEmail(
  input: BookingCancelledInput,
): { subject: string; html: string } {
  const tz = input.recipientTimezone || input.eventTimezone || 'UTC';
  const timeStr = formatEventTime(input.startsAt, tz);
  const eventUrl = `${BASE_URL}/events/${input.eventId}`;

  const subject = input.recipientIsCanceller
    ? `You cancelled: ${input.eventTitle}`
    : `${input.cancellerName} cancelled: ${input.eventTitle}`;

  const heading = input.recipientIsCanceller
    ? `You cancelled this meeting.`
    : `${escapeHtml(input.cancellerName)} cancelled this meeting.`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1612;color:#e8dcc8;margin:0;padding:0;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;">

  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;">Liminal Calendar</span>
  </div>

  <p style="font-size:13px;color:#a08c6e;margin:0 0 4px 0;">${heading}</p>
  <h1 style="font-size:20px;font-weight:600;color:#e8dcc8;margin:0 0 8px 0;text-decoration:line-through;text-decoration-color:#6b5f4f;">${escapeHtml(input.eventTitle)}</h1>
  <p style="font-size:14px;color:#a08c6e;margin:0 0 20px 0;">${escapeHtml(timeStr)}</p>

  ${input.reason ? `
  <div style="margin:16px 0;padding:12px 14px;background:#221c16;border-left:3px solid #c4935a;border-radius:4px;">
    <p style="font-size:11px;color:#a08c6e;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px 0;">Reason</p>
    <p style="font-size:14px;color:#e8dcc8;margin:0;white-space:pre-wrap;">${escapeHtml(input.reason)}</p>
  </div>` : ''}

  <div style="margin:20px 0;">
    <a href="${eventUrl}" style="font-size:13px;color:#c4935a;text-decoration:underline;">View event details</a>
  </div>

  <hr style="border:none;border-top:1px solid #2a2520;margin:24px 0;">
  <p style="font-size:11px;color:#6b5f4f;text-align:center;">
    Sent by Liminal Calendar
  </p>

</div></body></html>`;

  return { subject, html };
}

