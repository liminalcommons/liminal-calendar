/**
 * Public unsubscribe endpoint for the monthly update.
 *
 * GET  — verify the token and render a small confirmation page. GET never
 *        mutates, so mail-client link scanners that pre-fetch the URL can't
 *        opt someone out by accident.
 * POST — perform the opt-out. Serves both the confirmation-page form and RFC
 *        8058 one-click unsubscribe (List-Unsubscribe-Post) from Gmail/Apple.
 *
 * Identity + token travel in the query string, so the one-click POST (which
 * carries only `List-Unsubscribe=One-Click` in its body) still authorizes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { suppressEmail } from '@/lib/newsletter/repo';
import { verifyUnsubscribeToken } from '@/lib/newsletter/unsubscribe-token';

export const dynamic = 'force-dynamic';

function htmlPage(title: string, message: string, status = 200): NextResponse {
  const body = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#0f0e0c;color:#e8dccc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:64px 20px;text-align:center;">
      <div style="font-size:12px;color:#a08c6e;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;">Liminal Commons</div>
      <div style="background:#1a1815;border:1px solid #3a342c;border-radius:12px;padding:32px;">
        ${message}
      </div>
    </div>
  </body>
</html>`;
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function readParams(request: NextRequest): { email: string; token: string } {
  const url = new URL(request.url);
  return {
    email: (url.searchParams.get('e') || '').trim(),
    token: (url.searchParams.get('t') || '').trim(),
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET(request: NextRequest) {
  const { email, token } = readParams(request);
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return htmlPage(
      'Invalid unsubscribe link',
      `<h1 style="margin:0 0 8px;font-size:20px;">This link is invalid or expired</h1>
       <p style="margin:0;color:#c4b69a;font-size:14px;line-height:1.6;">If you're still getting emails you don't want, reply to any of them and we'll remove you.</p>`,
      400,
    );
  }

  const url = new URL(request.url);
  const action = `${url.pathname}?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
  return htmlPage(
    'Unsubscribe',
    `<h1 style="margin:0 0 12px;font-size:20px;">Unsubscribe from updates?</h1>
     <p style="margin:0 0 24px;color:#c4b69a;font-size:14px;line-height:1.6;">
       You will stop receiving monthly community updates at <strong>${escapeHtml(email)}</strong>.
       Event reminders you've set up are unaffected.
     </p>
     <form method="POST" action="${action}">
       <button type="submit" style="display:inline-block;padding:12px 28px;background:#c4935a;color:#0f0e0c;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">
         Confirm unsubscribe
       </button>
     </form>`,
  );
}

export async function POST(request: NextRequest) {
  const { email, token } = readParams(request);
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return htmlPage(
      'Invalid unsubscribe link',
      `<h1 style="margin:0 0 8px;font-size:20px;">This link is invalid or expired</h1>
       <p style="margin:0;color:#c4b69a;font-size:14px;line-height:1.6;">If you're still getting emails you don't want, reply to any of them and we'll remove you.</p>`,
      400,
    );
  }

  try {
    await suppressEmail(db, email);
  } catch (err) {
    console.error('[POST /api/newsletter/unsubscribe]', err);
    return htmlPage(
      'Something went wrong',
      `<h1 style="margin:0 0 8px;font-size:20px;">We couldn't process that</h1>
       <p style="margin:0;color:#c4b69a;font-size:14px;line-height:1.6;">Please try again, or reply to any update email and we'll remove you.</p>`,
      500,
    );
  }

  return htmlPage(
    'Unsubscribed',
    `<h1 style="margin:0 0 8px;font-size:20px;">You're unsubscribed</h1>
     <p style="margin:0;color:#c4b69a;font-size:14px;line-height:1.6;">${escapeHtml(email)} won't receive further monthly updates. You can re-subscribe anytime from an event RSVP.</p>`,
  );
}
