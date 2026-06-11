import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import {
  redactEventUrlForNonMembers,
  type DisplayEvent,
} from '@/lib/display-event';
import { EventCard } from '@/components/events/EventCard';

const baseEvent = {
  id: 1,
  title: 'Open Circle',
  starts_at: '2026-06-11T18:00:00Z',
  duration_minutes: 60,
  event_url: 'https://meet.example.com/open-circle',
  visibility: 'public',
  creator_name: 'Erik',
  rsvps: [],
  attendees: { total: 0, going: 0, interested: 0 },
} as unknown as DisplayEvent;

describe('redactEventUrlForNonMembers', () => {
  it('strips the URL and sets the redaction flag', () => {
    const redacted = redactEventUrlForNonMembers(baseEvent);
    expect(redacted.event_url).toBeNull();
    expect(redacted.event_url_redacted).toBe(true);
  });

  it('is a no-op for events without a meeting link', () => {
    const noUrl = { ...baseEvent, event_url: null };
    const out = redactEventUrlForNonMembers(noUrl);
    expect(out).toBe(noUrl);
    expect(out.event_url_redacted).toBeUndefined();
  });
});

describe('guest tier — Join Meeting gating (server-redaction driven)', () => {
  // The whole card is wrapped in a Link to /events/:id, so query by href.
  const linkWithHref = (href: string) =>
    screen.queryAllByRole('link').find((l) => l.getAttribute('href') === href);

  it('renders the Join Meeting link for members (unredacted payload)', () => {
    render(<EventCard event={baseEvent} />);
    expect(linkWithHref(baseEvent.event_url!)).toBeDefined();
  });

  it('renders a sign-up door instead when the URL is redacted', () => {
    render(<EventCard event={redactEventUrlForNonMembers(baseEvent)} />);
    expect(linkWithHref('https://meet.example.com/open-circle')).toBeUndefined();
    const signup = screen.getByText(/Sign up to join this event/i).closest('a');
    expect(signup).toHaveAttribute('href', '/welcome');
  });
});
