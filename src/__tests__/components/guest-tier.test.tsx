import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { GUEST_COOKIE } from '@/lib/guest';
import { EventCard } from '@/components/events/EventCard';
import type { DisplayEvent } from '@/lib/display-event';

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

function setGuestCookie(on: boolean) {
  document.cookie = on
    ? `${GUEST_COOKIE}=1`
    : `${GUEST_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

describe('guest tier — Join Meeting gating', () => {
  afterEach(() => setGuestCookie(false));

  // The whole card is wrapped in a Link to /events/:id, so query by href.
  const meetingLink = () =>
    screen
      .queryAllByRole('link')
      .find((l) => l.getAttribute('href') === baseEvent.event_url);

  it('renders the Join Meeting link for non-guests', () => {
    setGuestCookie(false);
    render(<EventCard event={baseEvent} />);
    expect(meetingLink()).toBeDefined();
  });

  it('disables Join Meeting for guests', () => {
    setGuestCookie(true);
    render(<EventCard event={baseEvent} />);
    expect(meetingLink()).toBeUndefined();
    expect(
      screen.getByRole('button', { name: /Join Meeting/i }),
    ).toBeDisabled();
    expect(screen.getByText(/sign up to join/i)).toBeInTheDocument();
  });
});
