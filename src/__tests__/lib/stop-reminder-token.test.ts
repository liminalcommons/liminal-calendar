/**
 * @jest-environment node
 */

// Stable secret so token output is deterministic across the test run.
process.env.CRON_SECRET = 'test-secret-for-hmac';

import { stopReminderToken, verifyStopToken } from '@/lib/notifications/reminders';

describe('stopReminderToken / verifyStopToken', () => {
  it('produces a 32-char hex token', () => {
    const token = stopReminderToken(42, 'user-A');
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).toHaveLength(32);
  });

  it('verifies a correct token', () => {
    const token = stopReminderToken(42, 'user-A');
    expect(verifyStopToken(42, 'user-A', token)).toBe(true);
  });

  it('rejects a tampered token', () => {
    const token = stopReminderToken(42, 'user-A');
    expect(verifyStopToken(42, 'user-A', token.slice(0, 31) + '0')).toBe(false);
  });

  it('binds the token to (eventId, userId)', () => {
    const token = stopReminderToken(42, 'A');
    expect(verifyStopToken(42, 'A', token)).toBe(true);
    expect(verifyStopToken(99, 'A', token)).toBe(false);
    expect(verifyStopToken(42, 'B', token)).toBe(false);
  });

  it('rejects a wrong-length token without throwing (timingSafeEqual guard)', () => {
    expect(verifyStopToken(42, 'A', '')).toBe(false);
    expect(verifyStopToken(42, 'A', 'short')).toBe(false);
    expect(verifyStopToken(42, 'A', 'a'.repeat(64))).toBe(false);
  });

  it('prefers STOP_TOKEN_SECRET over CRON_SECRET when set', () => {
    const cronToken = stopReminderToken(7, 'u');
    const prev = process.env.STOP_TOKEN_SECRET;
    process.env.STOP_TOKEN_SECRET = 'a-different-dedicated-secret';
    try {
      const dedicatedToken = stopReminderToken(7, 'u');
      expect(dedicatedToken).not.toBe(cronToken);
      // A token minted under CRON_SECRET must NOT verify once a dedicated
      // secret is in force.
      expect(verifyStopToken(7, 'u', cronToken)).toBe(false);
      expect(verifyStopToken(7, 'u', dedicatedToken)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.STOP_TOKEN_SECRET;
      else process.env.STOP_TOKEN_SECRET = prev;
    }
  });

  it('fail-closed: throws when no signing secret is configured (no dev-secret fallback)', () => {
    const cron = process.env.CRON_SECRET;
    const stop = process.env.STOP_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.STOP_TOKEN_SECRET;
    try {
      expect(() => stopReminderToken(1, 'x')).toThrow(/secret/i);
      // verify must never authorize when it can't compute the expected token.
      expect(verifyStopToken(1, 'x', 'anything')).toBe(false);
    } finally {
      if (cron !== undefined) process.env.CRON_SECRET = cron;
      if (stop !== undefined) process.env.STOP_TOKEN_SECRET = stop;
    }
  });
});
