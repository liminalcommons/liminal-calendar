import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HandleEditor } from '@/components/booking/HandleEditor';

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));

import { apiFetch } from '@/lib/api-fetch';
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('invalid handle (uppercase) shows client-side warning and disables save', () => {
  render(<HandleEditor initialHandle={null} />);
  const input = screen.getByLabelText('Handle');
  fireEvent.change(input, { target: { value: 'Bad Handle!' } });
  // Save button should be disabled — invalid client format
  const save = screen.getByRole('button', { name: /save/i });
  expect(save).toBeDisabled();
  expect(mockApiFetch).not.toHaveBeenCalled();
});

test('valid handle but server returns 409 — error is rendered', async () => {
  mockApiFetch.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: 'handle is taken' }),
  } as Response);

  render(<HandleEditor initialHandle={null} />);
  const input = screen.getByLabelText('Handle');
  fireEvent.change(input, { target: { value: 'alice' } });
  const save = screen.getByRole('button', { name: /save/i });
  fireEvent.click(save);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/taken/i);
  });
});

test('valid handle saves and shows success', async () => {
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ handle: 'alice' }),
  } as Response);

  render(<HandleEditor initialHandle={null} />);
  fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'alice' } });
  fireEvent.click(screen.getByRole('button', { name: /save/i }));

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(/saved/i);
  });
});
