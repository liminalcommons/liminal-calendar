/**
 * SlotPicker — public booking page client component.
 * Task 8 of Plan 3 (1:1 Booking).
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

// Fixed dates so day-grouping is stable across machines/tz.
const DAY1_A = '2026-06-01T15:00:00.000Z';
const DAY1_B = '2026-06-01T16:00:00.000Z';
const DAY2_A = '2026-06-02T15:00:00.000Z';

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('shows loading state then renders slots grouped by day', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A, DAY1_B, DAY2_A]));

  render(<SlotPicker handle="alice" slug="coffee" />);
  // Loading state present immediately
  expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

  await waitFor(() => {
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  // Two day groups (one for each unique calendar day in local tz).
  const headings = screen.getAllByRole('heading', { level: 3 });
  expect(headings.length).toBe(2);

  // Three slot buttons total.
  const buttons = screen.getAllByRole('button');
  expect(buttons.length).toBe(3);
});

test('empty state when no slots are available', async () => {
  mockApiFetch.mockResolvedValueOnce(slotsResponse([]));

  render(<SlotPicker handle="alice" slug="coffee" />);

  await waitFor(() => {
    expect(screen.getByText(/no times available/i)).toBeInTheDocument();
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
    expect(screen.getAllByRole('button').length).toBe(1);
  });
  fireEvent.click(screen.getAllByRole('button')[0]);

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
  // 1st: initial slots
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_A, DAY1_B]));
  // 2nd: POST /book → 409
  mockApiFetch.mockResolvedValueOnce({
    ok: false,
    status: 409,
    json: async () => ({ error: 'taken' }),
  } as Response);
  // 3rd: refetch → fewer slots
  mockApiFetch.mockResolvedValueOnce(slotsResponse([DAY1_B]));

  render(<SlotPicker handle="alice" slug="coffee" />);
  await waitFor(() => {
    expect(screen.getAllByRole('button').length).toBe(2);
  });

  await act(async () => {
    fireEvent.click(screen.getAllByRole('button')[0]);
  });

  await waitFor(() => {
    expect(screen.getByText(/just taken, refreshing/i)).toBeInTheDocument();
  });

  // After refetch only 1 slot remains.
  await waitFor(() => {
    expect(screen.getAllByRole('button').length).toBe(1);
  });

  // 3 fetch calls total: initial GET, POST 409, refetch GET.
  expect(mockApiFetch).toHaveBeenCalledTimes(3);
  expect((mockApiFetch.mock.calls[0][0] as string)).toContain('/slots');
  expect((mockApiFetch.mock.calls[1][0] as string)).toContain('/book');
  expect((mockApiFetch.mock.calls[2][0] as string)).toContain('/slots');
});

test('401 on slots redirects to sign-in', async () => {
  const originalLocation = window.location;
  // jsdom: replace location with a stub we can read href off
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
