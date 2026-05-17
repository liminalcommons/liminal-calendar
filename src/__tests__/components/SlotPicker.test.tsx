/**
 * SlotPicker — public booking page client component.
 *
 * Verifies the calendar-style picker: a day strip (one button per day
 * with slots) on the left and a time-slot grid (only the selected
 * day's slots) on the right. Default selection is the first day with
 * slots, so a single day's time buttons appear on initial render.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SlotPicker } from '@/components/booking/SlotPicker';

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const ET = {
  id: 1,
  title: 'Coffee chat',
  durationMinutes: 30,
  locationKind: 'castalia' as const,
};

function slotsResponse(slots: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ eventType: ET, slots: slots.map((s) => ({ startsAt: s })) }),
  } as Response;
}

const DAY1_A = '2026-06-01T15:00:00.000Z';
const DAY1_B = '2026-06-01T16:00:00.000Z';
const DAY2_A = '2026-06-02T15:00:00.000Z';

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('renders one day-pill per day with slots; default-shows first day times', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A, DAY1_B, DAY2_A]));

  render(<SlotPicker handle="alice" slug="coffee" />);
  expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  // Two unique calendar days → two pills in the day strip.
  expect(screen.getAllByTestId('day-pill').length).toBe(2);

  // First day has 2 slots; default selection shows them as time buttons.
  expect(screen.getAllByTestId('time-slot').length).toBe(2);
});

test('clicking a different day pill switches the time-slot grid', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A, DAY1_B, DAY2_A]));

  render(<SlotPicker handle="alice" slug="coffee" />);
  await waitFor(() => {
    expect(screen.getAllByTestId('day-pill').length).toBe(2);
  });

  // Default: day 1 selected, 2 slots.
  expect(screen.getAllByTestId('time-slot').length).toBe(2);

  // Switch to day 2.
  fireEvent.click(screen.getAllByTestId('day-pill')[1]);
  expect(screen.getAllByTestId('time-slot').length).toBe(1);
});

test('empty state when no slots are available', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([]));

  render(<SlotPicker handle="alice" slug="coffee" />);

  await waitFor(() => {
    expect(screen.getByText(/no open times/i)).toBeInTheDocument();
  });
});

test('confirmation card renders on 201', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A]));
  mockApiFetch.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      id: 42,
      startsAt: DAY1_A,
      endsAt: '2026-06-01T15:30:00.000Z',
      location: 'https://castalia.one/r/abc',
      title: 'Coffee chat',
    }),
  } as Response);

  render(<SlotPicker handle="alice" slug="coffee" />);
  await waitFor(() => {
    expect(screen.getAllByTestId('time-slot').length).toBe(1);
  });
  fireEvent.click(screen.getAllByTestId('time-slot')[0]);

  await waitFor(() => {
    expect(screen.getByText(/you're booked/i)).toBeInTheDocument();
  });
  expect(screen.getByText(/Coffee chat/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /join link/i })).toHaveAttribute(
    'href',
    'https://castalia.one/r/abc',
  );
});

test('409 path shows toast and refetches slots', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A, DAY1_B]));
  mockApiFetch.mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({ error: 'taken' }),
  } as Response);
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_B]));

  render(<SlotPicker handle="alice" slug="coffee" />);
  await waitFor(() => {
    expect(screen.getAllByTestId('time-slot').length).toBe(2);
  });

  await act(async () => {
    fireEvent.click(screen.getAllByTestId('time-slot')[0]);
  });

  await waitFor(() => {
    expect(screen.getByText(/just taken/i)).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(screen.getAllByTestId('time-slot').length).toBe(1);
  });

  expect(mockApiFetch).toHaveBeenCalledTimes(3);
  expect((mockApiFetch.mock.calls[0][0] as string)).toContain('/slots');
  expect((mockApiFetch.mock.calls[1][0] as string)).toContain('/book');
  expect((mockApiFetch.mock.calls[2][0] as string)).toContain('/slots');
});

test('401 on slots redirects to sign-in', async () => {
  const originalLocation = window.location;
  // @ts-expect-error: redefining
  delete window.location;
  // @ts-expect-error: stub
  window.location = { href: '' };

  mockApiFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({}),
  } as Response);

  render(<SlotPicker handle="alice" slug="coffee" />);

  await waitFor(() => {
    expect(window.location.href).toBe('/sign-in?next=/alice/coffee');
  });

  // @ts-expect-error: restore
  window.location = originalLocation;
});
