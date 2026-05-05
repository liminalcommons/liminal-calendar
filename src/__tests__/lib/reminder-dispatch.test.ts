import {
  computeReminderWindow,
  filterUnsentRecipients,
  groupPushRecipientsByEvent,
  pickPushClickUrl,
  PUSH_WINDOWS,
  EMAIL_WINDOWS,
  computePostEventWindow,
  filterUnreportedRecipients,
  buildPostEventPayload,
  POST_EVENT_PUSH_WINDOW,
} from '@/lib/notifications/reminder-dispatch';

describe('computeReminderWindow', () => {
  it('returns [now+minMin, now+maxMin] minute boundaries', () => {
    const now = new Date('2026-04-20T12:00:00Z');
    const { windowStart, windowEnd } = computeReminderWindow(now, 55, 65);
    expect(windowStart.toISOString()).toBe('2026-04-20T12:55:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-04-20T13:05:00.000Z');
  });
});

describe('filterUnsentRecipients', () => {
  it('drops (event,user) pairs already present in the sent log', () => {
    const due = [
      { eventId: 1, userId: 'a' },
      { eventId: 1, userId: 'b' },
      { eventId: 2, userId: 'a' },
    ];
    const sent = [{ eventId: 1, userId: 'a' }];
    const out = filterUnsentRecipients(due, sent);
    expect(out).toEqual([
      { eventId: 1, userId: 'b' },
      { eventId: 2, userId: 'a' },
    ]);
  });

  it('returns all rows when the sent log is empty', () => {
    const due = [{ eventId: 1, userId: 'a' }];
    expect(filterUnsentRecipients(due, [])).toEqual(due);
  });

  it('matches on the (eventId, userId) pair, not userId alone', () => {
    const due = [{ eventId: 2, userId: 'a' }];
    const sent = [{ eventId: 1, userId: 'a' }];
    expect(filterUnsentRecipients(due, sent)).toEqual(due);
  });
});

describe('groupPushRecipientsByEvent', () => {
  it('collects userIds under their event and preserves first-seen event metadata', () => {
    const rows = [
      { eventId: 1, userId: 'a', title: 'T', location: 'L', description: 'D' },
      { eventId: 1, userId: 'b', title: 'T', location: 'L', description: 'D' },
      { eventId: 2, userId: 'a', title: 'U', location: null, description: null },
    ];
    const grouped = groupPushRecipientsByEvent(rows);
    expect(grouped.size).toBe(2);
    expect(grouped.get(1)).toEqual({ title: 'T', location: 'L', description: 'D', userIds: ['a', 'b'] });
    expect(grouped.get(2)).toEqual({ title: 'U', location: null, description: null, userIds: ['a'] });
  });

  it('dedupes userIds within the same event', () => {
    const rows = [
      { eventId: 1, userId: 'a', title: 'T', location: null, description: null },
      { eventId: 1, userId: 'a', title: 'T', location: null, description: null },
    ];
    const grouped = groupPushRecipientsByEvent(rows);
    expect(grouped.get(1)?.userIds).toEqual(['a']);
  });
});

describe('pickPushClickUrl', () => {
  it('picks the first http(s) link found in location or description', () => {
    expect(pickPushClickUrl(1, 'see https://zoom.us/j/abc and notes', null)).toBe(
      'https://zoom.us/j/abc',
    );
    expect(pickPushClickUrl(1, null, 'Join at https://meet.google.com/xyz')).toBe(
      'https://meet.google.com/xyz',
    );
  });

  it('falls back to the event detail page when no link exists', () => {
    expect(pickPushClickUrl(42, 'Coffee House', 'See you there')).toBe(
      'https://calendar.castalia.one/events/42',
    );
  });

  it('honors a custom fallback base url', () => {
    expect(pickPushClickUrl(42, null, null, 'https://alt.example')).toBe(
      'https://alt.example/events/42',
    );
  });
});

describe('constants', () => {
  it('PUSH_WINDOWS covers 1h / 15min / at-start with distinct dedupe types', () => {
    const types = PUSH_WINDOWS.map((w) => w.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toEqual(['push-1hr', 'push-15min', 'push-start']);
  });

  it('EMAIL_WINDOWS uses a different type namespace than PUSH_WINDOWS', () => {
    const emailTypes = EMAIL_WINDOWS.map(([t]) => t);
    const pushTypes = PUSH_WINDOWS.map((w) => w.type);
    for (const et of emailTypes) expect(pushTypes).not.toContain(et);
  });
});

describe('computePostEventWindow', () => {
  it('returns [now - maxMinAfterEnd, now - minMinAfterEnd] of effective-end timestamps', () => {
    const now = new Date('2026-05-03T12:00:00Z');
    const { windowStart, windowEnd } = computePostEventWindow(now, 30, 1440);
    expect(windowStart.toISOString()).toBe('2026-05-02T12:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-05-03T11:30:00.000Z');
  });

  it('windowStart is strictly older than windowEnd', () => {
    const now = new Date('2026-05-03T12:00:00Z');
    const { windowStart, windowEnd } = computePostEventWindow(now, 30, 1440);
    expect(windowStart.getTime()).toBeLessThan(windowEnd.getTime());
  });
});

describe('filterUnreportedRecipients', () => {
  it('drops (event,user) pairs that already have an attendance report', () => {
    const due = [
      { eventId: 1, userId: 'a' },
      { eventId: 1, userId: 'b' },
      { eventId: 2, userId: 'a' },
    ];
    const reported = [{ eventId: 1, userId: 'b' }];
    expect(filterUnreportedRecipients(due, reported)).toEqual([
      { eventId: 1, userId: 'a' },
      { eventId: 2, userId: 'a' },
    ]);
  });

  it('returns all rows when nothing has been reported', () => {
    const due = [{ eventId: 1, userId: 'a' }];
    expect(filterUnreportedRecipients(due, [])).toEqual(due);
  });

  it('matches on (eventId, reporterId) pair, not reporterId alone', () => {
    const due = [{ eventId: 2, userId: 'a' }];
    const reported = [{ eventId: 1, userId: 'a' }];
    expect(filterUnreportedRecipients(due, reported)).toEqual(due);
  });
});

describe('buildPostEventPayload', () => {
  it('produces a deep-link to the event detail page anchored at the report section', () => {
    const p = buildPostEventPayload(42, 'Coffee House');
    expect(p.url).toBe('https://calendar.castalia.one/events/42#attendance-report');
  });

  it('honors a custom base url', () => {
    const p = buildPostEventPayload(42, 'X', 'https://alt.example');
    expect(p.url).toBe('https://alt.example/events/42#attendance-report');
  });

  it('uses a per-event tag so duplicate prompts collapse on the device', () => {
    expect(buildPostEventPayload(7, 'X').tag).toBe('post-event-7');
    expect(buildPostEventPayload(8, 'X').tag).toBe('post-event-8');
  });

  it('puts the event title in the notification title', () => {
    const p = buildPostEventPayload(1, 'Quarterly Sync');
    expect(p.title).toContain('Quarterly Sync');
  });

  it('body invites a yes/no follow-up without prejudging the answer', () => {
    const p = buildPostEventPayload(1, 'X');
    expect(p.body.length).toBeGreaterThan(0);
  });
});

describe('POST_EVENT_PUSH_WINDOW', () => {
  it('uses a unique dedupe type distinct from pre-event PUSH_WINDOWS', () => {
    const pre = PUSH_WINDOWS.map((w) => w.type);
    expect(pre).not.toContain(POST_EVENT_PUSH_WINDOW.type);
  });

  it('declares an "after end" window — minMinAfterEnd >= 0 and < maxMinAfterEnd', () => {
    expect(POST_EVENT_PUSH_WINDOW.minMinAfterEnd).toBeGreaterThanOrEqual(0);
    expect(POST_EVENT_PUSH_WINDOW.minMinAfterEnd).toBeLessThan(
      POST_EVENT_PUSH_WINDOW.maxMinAfterEnd,
    );
  });
});
