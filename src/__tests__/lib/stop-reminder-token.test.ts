/**
 * Regression guard for the email-reminder "unsubscribe from this event" link.
 * The link carries an HMAC-based token; if verification regresses to a trivial
 * equality check or an un-salted hash, any recipient could unsubscribe any
 * other recipient. Lock the current behavior.
 */

process.env.REMINDER_HMAC_SECRET = 'test-secret-for-stop-reminder';

import { stopReminderToken, verifyStopToken } from '@/lib/notifications/reminders';

describe('stopReminderToken / verifyStopToken', () => {
  it('a generated token validates for its own (eventId, userId) pair', () => {
    const token = stopReminderToken(42, 'user-A');
    expect(verifyStopToken(42, 'user-A', token)).toBe(true);
  });

  it('token is a 32-char hex string', () => {
    const token = stopReminderToken(42, 'user-A');
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('same inputs produce the same token (deterministic)', () => {
    expect(stopReminderToken(1, 'x')).toBe(stopReminderToken(1, 'x'));
  });

  it("a token for (42, 'A') does NOT validate for (42, 'B')", () => {
    const token = stopReminderToken(42, 'A');
    expect(verifyStopToken(42, 'B', token)).toBe(false);
  });

  it("a token for (42, 'A') does NOT validate for (43, 'A')", () => {
    const token = stopReminderToken(42, 'A');
    expect(verifyStopToken(43, 'A', token)).toBe(false);
  });

  it('rejects an empty token', () => {
    expect(verifyStopToken(42, 'A', '')).toBe(false);
  });

  it('rejects an obviously-wrong token', () => {
    expect(verifyStopToken(42, 'A', 'z'.repeat(32))).toBe(false);
  });
});
