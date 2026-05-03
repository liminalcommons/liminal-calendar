import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NotificationPreferences } from '@/components/NotificationPreferences';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

function mockGetReturns(prefs: Record<string, boolean>) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => prefs,
  } as Response);
}

describe('<NotificationPreferences>', () => {
  it('renders six checkboxes after load', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    });
  });

  it('reflects loaded state in checkbox checked attribute', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: false, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: true, emailFifteenMin: false,
    });
    render(<NotificationPreferences />);
    await waitFor(() => {
      expect(screen.getByLabelText(/1 hour before/i, { selector: 'input[name="pushOneHour"]' })).toBeChecked();
      expect(screen.getByLabelText(/15 minutes before/i, { selector: 'input[name="pushFifteenMin"]' })).not.toBeChecked();
    });
  });

  it('PUTs to /api/preferences/notifications when a checkbox toggles', async () => {
    mockGetReturns({
      pushOneHour: true, pushFifteenMin: true, pushAtStart: true,
      emailTwentyFourHour: false, emailOneHour: false, emailFifteenMin: false,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);
    render(<NotificationPreferences />);
    await waitFor(() => screen.getAllByRole('checkbox'));
    fireEvent.click(screen.getByLabelText(/24 hours before/i));
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe('/api/preferences/notifications');
      expect(lastCall?.[1]?.method).toBe('PUT');
      const sent = JSON.parse(String(lastCall?.[1]?.body));
      expect(sent.emailTwentyFourHour).toBe(true);
    });
  });
});
