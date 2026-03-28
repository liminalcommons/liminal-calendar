import { hyloEventToDisplayEvent } from '../../lib/display-event';
import type { HyloEvent } from '../../types/hylo-types';

function makeHyloEvent(overrides: Partial<HyloEvent> = {}): HyloEvent {
  return {
    id: 'e1',
    title: 'Test Event',
    type: 'event',
    createdAt: '2026-03-01T10:00:00Z',
    creator: { id: 'u1', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' },
    startTime: '2026-03-28T18:00:00Z',
    endTime: '2026-03-28T20:00:00Z',
    timezone: 'America/New_York',
    ...overrides,
  };
}

describe('hyloEventToDisplayEvent', () => {
  it('maps required fields correctly', () => {
    const event = makeHyloEvent();
    const display = hyloEventToDisplayEvent(event);

    expect(display.id).toBe('e1');
    expect(display.title).toBe('Test Event');
    expect(display.starts_at).toBe('2026-03-28T18:00:00Z');
    expect(display.ends_at).toBe('2026-03-28T20:00:00Z');
    expect(display.creator_id).toBe('u1');
    expect(display.creator_name).toBe('Alice');
    expect(display.creator_image).toBe('https://example.com/alice.jpg');
    expect(display.timezone).toBe('America/New_York');
  });

  it('maps attendee counts from invitations', () => {
    const event = makeHyloEvent({
      eventInvitations: {
        total: 5,
        items: [
          { person: { id: 'u2', name: 'Bob' }, response: 'yes' },
          { person: { id: 'u3', name: 'Carol' }, response: 'yes' },
          { person: { id: 'u4', name: 'Dave' }, response: 'interested' },
          { person: { id: 'u5', name: 'Eve' }, response: 'no' },
        ],
      },
    });
    const display = hyloEventToDisplayEvent(event);
    expect(display.attendees.total).toBe(5);
    expect(display.attendees.going).toBe(2);
    expect(display.attendees.interested).toBe(1);
  });

  it('extracts URL from location field when it is a URL', () => {
    const event = makeHyloEvent({ location: 'https://zoom.us/j/123456' });
    const display = hyloEventToDisplayEvent(event);
    expect(display.event_url).toBe('https://zoom.us/j/123456');
  });

  it('extracts URL from details when location is plain text', () => {
    const event = makeHyloEvent({
      location: 'Community Hall, 123 Main St',
      details: 'Join us at https://meet.google.com/abc-def for the online stream',
    });
    const display = hyloEventToDisplayEvent(event);
    expect(display.event_url).toBe('https://meet.google.com/abc-def');
    expect(display.location).toBe('Community Hall, 123 Main St');
  });

  it('returns null event_url when no URL found', () => {
    const event = makeHyloEvent({ location: 'Community Hall', details: 'Come join us!' });
    const display = hyloEventToDisplayEvent(event);
    expect(display.event_url).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    const event = makeHyloEvent({
      endTime: undefined,
      details: undefined,
      location: undefined,
      timezone: undefined,
      myEventResponse: undefined,
      eventInvitations: undefined,
    });
    const display = hyloEventToDisplayEvent(event);
    expect(display.ends_at).toBeNull();
    expect(display.description).toBeNull();
    expect(display.location).toBeNull();
    expect(display.timezone).toBe('UTC');
    expect(display.myResponse).toBeNull();
    expect(display.attendees).toEqual({ total: 0, going: 0, interested: 0 });
  });

  it('maps imageUrl when present', () => {
    const event = makeHyloEvent({ imageUrl: 'https://example.com/img.jpg' });
    const display = hyloEventToDisplayEvent(event);
    expect(display.imageUrl).toBe('https://example.com/img.jpg');
  });

  it('leaves imageUrl undefined when absent', () => {
    const event = makeHyloEvent({ imageUrl: undefined });
    const display = hyloEventToDisplayEvent(event);
    expect(display.imageUrl).toBeUndefined();
  });

  it('maps myEventResponse to myResponse', () => {
    const event = makeHyloEvent({ myEventResponse: 'yes' });
    const display = hyloEventToDisplayEvent(event);
    expect(display.myResponse).toBe('yes');
  });
});
