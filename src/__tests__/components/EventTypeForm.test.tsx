import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventTypeForm } from '@/components/booking/EventTypeForm';

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockApiFetch.mockReset();
});

test('required-field validation: empty title and slug blocks submit', async () => {
  const onSaved = jest.fn();
  const onCancel = jest.fn();
  render(<EventTypeForm onSaved={onSaved} onCancel={onCancel} />);

  fireEvent.click(screen.getByRole('button', { name: /Create event type/i }));

  await waitFor(() => {
    expect(screen.getByText(/Title is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Slug is required/i)).toBeInTheDocument();
  });
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('locationValue field hidden when locationKind=castalia, shown otherwise', () => {
  render(<EventTypeForm onSaved={jest.fn()} onCancel={jest.fn()} />);

  // castalia is default — locationValue NOT shown
  expect(screen.queryByLabelText(/Location detail/i)).not.toBeInTheDocument();

  // switch to external_link — locationValue appears
  fireEvent.click(screen.getByLabelText(/External link/i));
  expect(screen.getByLabelText(/Location detail/i)).toBeInTheDocument();

  // switch back to castalia — hidden again
  fireEvent.click(screen.getByLabelText(/In Castalia/i));
  expect(screen.queryByLabelText(/Location detail/i)).not.toBeInTheDocument();
});

test('external_link without value shows error and blocks submit', async () => {
  render(<EventTypeForm onSaved={jest.fn()} onCancel={jest.fn()} />);

  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Quick chat' } });
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'quick-chat' } });
  fireEvent.click(screen.getByLabelText(/External link/i));

  fireEvent.click(screen.getByRole('button', { name: /Create event type/i }));

  await waitFor(() => {
    expect(screen.getByText(/Location detail is required/i)).toBeInTheDocument();
  });
  expect(mockApiFetch).not.toHaveBeenCalled();
});

test('valid POST sends payload and calls onSaved', async () => {
  const created = {
    id: 42,
    slug: 'quick-chat',
    title: 'Quick chat',
    description: null,
    durationMinutes: 30,
    locationKind: 'castalia' as const,
    locationValue: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 60,
    maxDaysAhead: 30,
  };
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => created,
  } as Response);

  const onSaved = jest.fn();
  render(<EventTypeForm onSaved={onSaved} onCancel={jest.fn()} />);

  fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Quick chat' } });
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'quick-chat' } });

  fireEvent.click(screen.getByRole('button', { name: /Create event type/i }));

  await waitFor(() => {
    expect(onSaved).toHaveBeenCalledWith(created);
  });
  expect(mockApiFetch).toHaveBeenCalledWith(
    '/api/booking/event-types',
    expect.objectContaining({ method: 'POST' }),
  );
});
