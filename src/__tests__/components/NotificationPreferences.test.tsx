import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NotificationPreferences } from '@/components/NotificationPreferences';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

// The component issues two GETs on mount — the preferences load and a
// muted-series load — plus a PUT on toggle. Route by URL/method instead of call
// order so the muted-series fetch doesn't consume the single queued preferences
// response (which left the prefs fetch resolving to undefined and threw).
function mockGetReturns(prefs: Record<string, boolean>) {
  fetchMock.mockImplementation((url: unknown, opts?: { method?: string }) => {
    if (typeof url === 'string' && url.includes('/muted')) {
      return Promise.resolve({ ok: true, json: async () => ({ muted: [] }) } as Response);
    }
    if (opts?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => prefs } as Response);
  });
}

describe('<NotificationPreferences>', () => {
  it('renders six toggles after load', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(6);
    });
  });

  it('reflects loaded state in toggle aria-checked attribute', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: false, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: true, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      const pushOneHour = screen.getAllByRole('switch', { name: /1 hour before/i })[0];
      const pushFifteenMin = screen.getAllByRole('switch', { name: /15 minutes before/i })[0];
      expect(pushOneHour).toHaveAttribute('aria-checked', 'true');
      expect(pushFifteenMin).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('PUTs to /api/preferences/notifications when a toggle is clicked', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => screen.getAllByRole('switch'));
    fireEvent.click(screen.getByRole('switch', { name: /24 hours before/i }));
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('/api/preferences/notifications');
      expect(lastCall?.[1]?.method).toBe('PUT');
      const sent = JSON.parse(String(lastCall?.[1]?.body));
      expect(sent.emailTwentyFourHour).toBe(true);
    });
  });
});
