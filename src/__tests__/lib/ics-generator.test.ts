import { generateICS, generateCalendarFeed, type ICSEvent } from '@/lib/ics-generator';

const sampleEvent: ICSEvent & { id: string } = {
  id: '12345',
  title: 'Weekly Stewards Circle',
  description: 'Community governance meeting',
  starts_at: '2026-03-28T14:00:00Z',
  ends_at: '2026-03-28T15:30:00Z',
  location: 'Online',
  url: 'https://meet.example.com/stewards',
  organizer: { name: 'Victor' },
  recurrenceRule: 'weekly',
};

const sampleEvent2: ICSEvent & { id: string } = {
  id: '67890',
  title: 'Glass Bead Game',
  starts_at: '2026-03-29T18:00:00Z',
  ends_at: '2026-03-29T19:00:00Z',
};

describe('generateCalendarFeed', () => {
  it('produces a valid VCALENDAR with multiple VEVENTs', () => {
    const ics = generateCalendarFeed([sampleEvent, sampleEvent2]);

    // One VCALENDAR wrapper
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/END:VCALENDAR/g)).toHaveLength(1);

    // Two VEVENTs
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it('uses stable UIDs based on event ID', () => {
    const ics = generateCalendarFeed([sampleEvent]);
    expect(ics).toContain('UID:event-12345@liminalcommons.com');
  });

  it('produces the same UID on repeated calls (deterministic)', () => {
    const ics1 = generateCalendarFeed([sampleEvent]);
    const ics2 = generateCalendarFeed([sampleEvent]);
    const uid1 = ics1.match(/UID:(.+)/)?.[1];
    const uid2 = ics2.match(/UID:(.+)/)?.[1];
    expect(uid1).toBe(uid2);
  });

  it('includes calendar metadata', () => {
    const ics = generateCalendarFeed([sampleEvent]);
    expect(ics).toContain('X-WR-CALNAME:Liminal Commons');
    expect(ics).toContain('X-PUBLISHED-TTL:PT15M');
    expect(ics).toContain('METHOD:PUBLISH');
  });

  it('includes event details', () => {
    const ics = generateCalendarFeed([sampleEvent]);
    expect(ics).toContain('SUMMARY:Weekly Stewards Circle');
    expect(ics).toContain('LOCATION:Online');
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('ORGANIZER;CN=Victor:mailto:calendar@liminalcommons.com');
  });

  it('includes alarm', () => {
    const ics = generateCalendarFeed([sampleEvent]);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT15M');
  });

  it('handles empty event list', () => {
    const ics = generateCalendarFeed([]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('defaults end time to +1 hour when not provided', () => {
    const ics = generateCalendarFeed([sampleEvent2]);
    // starts 18:00, should end 19:00
    expect(ics).toContain('DTSTART:20260329T180000Z');
    expect(ics).toContain('DTEND:20260329T190000Z');
  });
});

describe('generateICS (single event, existing)', () => {
  it('wraps single event in its own VCALENDAR', () => {
    const ics = generateICS(sampleEvent);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
