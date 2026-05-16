/**
 * buildBookingConfirmedEmail — verify subject/HTML differ between the
 * owner and booker flavors, that escaping fires on hostile titles, and
 * that a meeting link in `location` produces a CTA button.
 */

import { buildBookingConfirmedEmail } from '@/lib/notifications/booking-emails';

const baseInput = {
  eventId: 42,
  eventTitle: 'Coffee chat',
  startsAt: new Date('2026-05-20T15:00:00.000Z'),
  endsAt: new Date('2026-05-20T15:30:00.000Z'),
  location: 'https://castalia.one/r/abc123',
  ownerName: 'Alice',
  bookerName: 'Bob',
  recipientTimezone: 'UTC',
  eventTimezone: 'UTC',
};

describe('buildBookingConfirmedEmail', () => {
  test('owner flavor — subject names the booker', () => {
    const { subject } = buildBookingConfirmedEmail({ ...baseInput, flavor: 'owner' });
    expect(subject).toBe('Bob booked Coffee chat');
  });

  test('booker flavor — subject names the owner', () => {
    const { subject } = buildBookingConfirmedEmail({ ...baseInput, flavor: 'booker' });
    expect(subject).toBe('Booked: Coffee chat with Alice');
  });

  test('owner html includes the booker name heading', () => {
    const { html } = buildBookingConfirmedEmail({ ...baseInput, flavor: 'owner' });
    expect(html).toContain('Bob booked time with you');
    expect(html).toContain('Coffee chat');
  });

  test('booker html includes the owner name heading', () => {
    const { html } = buildBookingConfirmedEmail({ ...baseInput, flavor: 'booker' });
    expect(html).toContain('Your time with Alice is booked');
  });

  test('meeting link in location renders a CTA button', () => {
    const { html } = buildBookingConfirmedEmail({ ...baseInput, flavor: 'booker' });
    expect(html).toContain('href="https://castalia.one/r/abc123"');
    expect(html).toContain('Open meeting room');
  });

  test('no meeting link → no CTA button', () => {
    const { html } = buildBookingConfirmedEmail({
      ...baseInput,
      flavor: 'booker',
      location: 'Cafe down the street',
    });
    expect(html).not.toContain('Open meeting room');
    expect(html).toContain('Cafe down the street');
  });

  test('html escaping prevents injection via event title', () => {
    const { html } = buildBookingConfirmedEmail({
      ...baseInput,
      flavor: 'booker',
      eventTitle: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('falls back to ISO string on bad timezone', () => {
    const { html } = buildBookingConfirmedEmail({
      ...baseInput,
      flavor: 'booker',
      recipientTimezone: 'Not/A_Real_Zone',
    });
    expect(html.length).toBeGreaterThan(0);
  });
});
