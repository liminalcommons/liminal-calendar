import { render, screen } from '@testing-library/react';
import { EventRSVP } from '@/components/events/EventRSVP';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }),
}));

// EventRSVP fetches /api/events/{id}/rsvp on mount via apiFetch.
// Stub apiFetch to return an empty attendees list so the component renders
// without error in the test.
jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ invitations: { items: [] } }),
  }),
}));

// useRsvpMutation is a React-Query-style hook — stub minimal shape.
jest.mock('@/lib/rsvp/use-rsvp-mutation', () => ({
  useRsvpMutation: () => ({ submit: jest.fn(), pending: false }),
}));

// SFX stub (component plays a shimmer on RSVP success).
jest.mock('@/lib/sound-manager', () => ({
  calendarSFX: { play: jest.fn() },
}));

describe('EventRSVP cleanups', () => {
  it('does not render a remindMe checkbox', () => {
    render(<EventRSVP eventId="1" />);
    expect(screen.queryByLabelText(/remind me/i)).not.toBeInTheDocument();
  });

  it('does not render the newsletter signup', () => {
    render(<EventRSVP eventId="1" />);
    expect(screen.queryByText(/subscribe to the monthly newsletter/i)).not.toBeInTheDocument();
  });

  it('shows recurring inline text when recurrenceRule is set', () => {
    render(<EventRSVP eventId="1" recurrenceRule="weekly" />);
    expect(screen.getByText(/recurring — applies to all occurrences/i)).toBeInTheDocument();
  });

  it('does not show recurring inline text for non-recurring events', () => {
    render(<EventRSVP eventId="1" />);
    expect(screen.queryByText(/recurring — applies to all occurrences/i)).not.toBeInTheDocument();
  });
});
