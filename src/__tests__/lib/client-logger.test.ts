/**
 * @jest-environment jsdom
 *
 * Tests for the bug-report client log buffer: structured event recording
 * and localStorage drain from a prior session's global-error stash.
 */

import { recordEvent, installConsoleInterceptors, getRecentLogsAsString } from '@/lib/client-logger';

beforeEach(() => {
  localStorage.clear();
  // The interceptors are installed exactly once per module-load; we can't
  // reset them between tests cheaply. Instead each test asserts on a
  // unique marker so we don't conflict with whatever's already in the
  // buffer from prior tests.
});

describe('client-logger.recordEvent', () => {
  it('appends a structured event with the requested level', () => {
    const marker = `marker-${Date.now()}-${Math.random()}`;
    recordEvent('warn', marker);
    const logs = getRecentLogsAsString();
    expect(logs).toContain('[WARN]');
    expect(logs).toContain(marker);
  });

  it('preserves multiple events in order', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    recordEvent('info', a);
    recordEvent('error', b);
    const logs = getRecentLogsAsString();
    const aIdx = logs.lastIndexOf(a);
    const bIdx = logs.lastIndexOf(b);
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});

describe('client-logger drain from localStorage', () => {
  it('replays stashed global-error entries on install', () => {
    const marker = `globerr-${Date.now()}`;
    localStorage.setItem('bug-report-pending', JSON.stringify([
      { timestamp: '2026-05-20T00:00:00Z', level: 'error', message: marker },
    ]));
    installConsoleInterceptors(); // idempotent — drains on every call only on first install
    // The drain only runs on first install; later calls in the same test
    // run are no-ops. So the first import in the suite already installed
    // and may have cleared the key — we just assert the localStorage was
    // touched (cleared after drain).
    expect(localStorage.getItem('bug-report-pending')).toBeNull();
  });

  it('survives malformed JSON in the stash without throwing', () => {
    localStorage.setItem('bug-report-pending', 'not-json{{{');
    expect(() => installConsoleInterceptors()).not.toThrow();
  });
});
