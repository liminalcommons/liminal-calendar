import { validateCreateEventInput } from '@/lib/events/create-event-input';

describe('validateCreateEventInput', () => {
  const good = {
    title: 'Stewards Circle',
    startTime: '2026-04-20T18:00:00Z',
    endTime: '2026-04-20T19:00:00Z',
    details: 'Agenda TBD',
    timezone: 'America/Los_Angeles',
    location: 'Zoom: https://zoom.us/j/123',
    imageUrl: 'https://img/x.png',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
    hyloGroupId: 'grp-42',
    hyloGroupIds: ['grp-42', 'grp-7'],
  };

  it('accepts a well-formed body', () => {
    const v = validateCreateEventInput(good);
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error();
    expect(v.value.title).toBe('Stewards Circle');
    expect(v.value.description).toBe('Agenda TBD');
    expect(v.value.timezone).toBe('America/Los_Angeles');
    expect(v.value.hyloGroupIds).toEqual(['grp-42', 'grp-7']);
    expect(v.value.startDate.toISOString()).toBe('2026-04-20T18:00:00.000Z');
  });

  it('trims the title', () => {
    const v = validateCreateEventInput({ ...good, title: '   Padded   ' });
    if (!v.ok) throw new Error();
    expect(v.value.title).toBe('Padded');
  });

  it('rejects non-object bodies', () => {
    expect(validateCreateEventInput(null).ok).toBe(false);
    expect(validateCreateEventInput('string').ok).toBe(false);
    expect(validateCreateEventInput(42).ok).toBe(false);
  });

  it('rejects empty / missing title', () => {
    const v = validateCreateEventInput({ ...good, title: '   ' });
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error();
    expect(v.error.error).toBe('title is required');
    expect(v.error.status).toBe(400);
  });

  it('rejects missing startTime and endTime', () => {
    expect(validateCreateEventInput({ ...good, startTime: undefined }).ok).toBe(false);
    expect(validateCreateEventInput({ ...good, endTime: undefined }).ok).toBe(false);
  });

  it('rejects invalid startTime / endTime strings', () => {
    const bad1 = validateCreateEventInput({ ...good, startTime: 'not-a-date' });
    if (bad1.ok) throw new Error();
    expect(bad1.error.error).toBe('startTime is not a valid date');

    const bad2 = validateCreateEventInput({ ...good, endTime: 'nope' });
    if (bad2.ok) throw new Error();
    expect(bad2.error.error).toBe('endTime is not a valid date');
  });

  it('defaults timezone to UTC when missing', () => {
    const v = validateCreateEventInput({ ...good, timezone: undefined });
    if (!v.ok) throw new Error();
    expect(v.value.timezone).toBe('UTC');
  });

  it('derives hyloGroupIds from hyloGroupId when the array is missing', () => {
    const v = validateCreateEventInput({ ...good, hyloGroupIds: undefined });
    if (!v.ok) throw new Error();
    expect(v.value.hyloGroupIds).toEqual(['grp-42']);
  });

  it('returns an empty hyloGroupIds when neither is provided', () => {
    const v = validateCreateEventInput({
      title: 'x',
      startTime: good.startTime,
      endTime: good.endTime,
    });
    if (!v.ok) throw new Error();
    expect(v.value.hyloGroupIds).toEqual([]);
  });

  it('drops non-string entries from hyloGroupIds', () => {
    const v = validateCreateEventInput({ ...good, hyloGroupIds: ['grp-1', 42, null, 'grp-2', ''] });
    if (!v.ok) throw new Error();
    expect(v.value.hyloGroupIds).toEqual(['grp-1', 'grp-2']);
  });

  it('normalizes absent optional fields to null', () => {
    const v = validateCreateEventInput({
      title: 't',
      startTime: good.startTime,
      endTime: good.endTime,
    });
    if (!v.ok) throw new Error();
    expect(v.value.description).toBeNull();
    expect(v.value.location).toBeNull();
    expect(v.value.imageUrl).toBeNull();
    expect(v.value.recurrenceRule).toBeNull();
    expect(v.value.hyloGroupId).toBeNull();
  });
});
