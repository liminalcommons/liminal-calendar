/**
 * HMAC unsubscribe tokens for the monthly update. Mirrors the reminder
 * stop-token design (src/lib/notifications/reminders.ts): a per-email token
 * that proves the unsubscribe link came from us, so a footer link can opt an
 * address out without any login.
 *
 * Fail-closed: no literal default secret. A missing signing secret throws on
 * generation and returns false on verification — never emits a forgeable link,
 * never authorizes a forged one.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://calendar.castalia.one';

function getSecret(): string {
  const secret = process.env.STOP_TOKEN_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error('STOP_TOKEN_SECRET (or CRON_SECRET) must be set to sign newsletter unsubscribe tokens');
  }
  return secret;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', getSecret())
    .update(`newsletter:${normalizeEmail(email)}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  let expected: string;
  try {
    expected = unsubscribeToken(email);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // Length check is safe to short-circuit — token length (32) is public.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  const token = unsubscribeToken(email);
  return `${BASE_URL}/api/newsletter/unsubscribe?e=${encodeURIComponent(normalizeEmail(email))}&t=${token}`;
}
