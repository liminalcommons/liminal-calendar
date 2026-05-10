import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { BookableWindowsEditor, detectClientOverlap } from '@/components/booking/BookableWindowsEditor';

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('detectClientOverlap', () => {
  test('returns false for empty', () => {
    expect(detectClientOverlap([[], [], [], [], [], [], []])).toBe(false);
  });

  test('returns false for non-overlapping ranges on same day', () => {
    const byDay = [
      [{ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' }],
      [], [], [], [], [], [],
    ];
    expect(detectClientOverlap(byDay)).toBe(false);
  });

  test('returns true for overlapping ranges on same day', () => {
    const byDay = [
      [{ start: '09:00', end: '10:30' }, { start: '10:00', end: '11:00' }],
      [], [], [], [], [], [],
    ];
    expect(detectClientOverlap(byDay)).toBe(true);
  });
});

test('renders 7 day rows after load', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);

  await act(async () => {
    render(<BookableWindowsEditor />);
  });

  await waitFor(() => {
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Sunday')).toBeInTheDocument();
  });
});

test('overlap on same day disables save and shows message', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);

  await act(async () => {
    render(<BookableWindowsEditor />);
  });
  await waitFor(() => expect(screen.getByText('Monday')).toBeInTheDocument());

  // Add two ranges to Monday
  const addBtn = screen.getByRole('button', { name: /Add range to Monday/i });
  fireEvent.click(addBtn);
  fireEvent.click(addBtn);

  // Both default to 09:00-17:00 → overlap
  const save = screen.getByRole('button', { name: /Save availability/i });
  expect(save).toBeDisabled();

  await waitFor(() => {
    expect(screen.getByText(/Overlapping windows/i)).toBeInTheDocument();
  });
});
