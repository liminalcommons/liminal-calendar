/**
 * EventForm — visibility selector gated by role.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { EventForm } from '@/components/events/EventForm';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/lib/use-resolved-role', () => ({
  useResolvedRole: () => ({ role: 'host', loading: false }),
}));

jest.mock('@/lib/timezone-utils', () => ({
  getUserTimezone: () => 'UTC',
  formatTimeInTimezone: () => '6:00 PM',
  isLateNightInAnyTimezone: () => false,
  COMMUNITY_TIMEZONES: [],
}));

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ role: 'host' }) })),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), refresh: jest.fn() }),
}));

describe('EventForm visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { role: 'host' } }, status: 'authenticated' });
  });

  it('shows visibility selector for hosts', async () => {
    render(<EventForm mode="create" />);
    await waitFor(() => {
      expect(screen.getByText('Public')).toBeInTheDocument();
    });
  });
});
