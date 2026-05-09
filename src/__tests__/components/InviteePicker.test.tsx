import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { InviteePicker, type Invitee } from '@/components/events/InviteePicker';

// Mock apiFetch
jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
  SESSION_EXPIRED_EVENT: 'calendar:session-expired',
}));

import { apiFetch } from '@/lib/api-fetch';
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const MEMBERS = [
  { userId: 'u1', name: 'Alice Alder', handle: 'alice', image: null },
  { userId: 'u2', name: 'Bob Birch', handle: 'bob', image: null },
  { userId: 'u3', name: 'Carol Cedar', handle: 'carol', image: null },
];

function makeSearchResponse(members: typeof MEMBERS) {
  return {
    ok: true,
    json: async () => ({ members }),
  } as Response;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockApiFetch.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderPicker(props: Partial<Parameters<typeof InviteePicker>[0]> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <InviteePicker
      value={props.value ?? []}
      onChange={props.onChange ?? onChange}
      cap={props.cap}
      disabled={props.disabled}
    />,
  );
  return { ...utils, onChange };
}

// 1. Renders empty state initially
test('renders empty state when value is empty and no query typed', () => {
  renderPicker();
  expect(screen.getByText(/Type a name to invite registered users/i)).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

// 2. Typing 2+ chars triggers fetch (debounced 250ms)
test('typing 2+ chars triggers fetch after debounce', async () => {
  mockApiFetch.mockResolvedValue(makeSearchResponse(MEMBERS));
  renderPicker();

  const input = screen.getByRole('textbox', { name: /search members to invite/i });
  fireEvent.change(input, { target: { value: 'al' } });

  // Before debounce fires, no fetch yet
  expect(mockApiFetch).not.toHaveBeenCalled();

  act(() => { jest.advanceTimersByTime(260); });

  await waitFor(() => {
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/members/search?q=al'),
    );
  });
  expect(await screen.findByRole('listbox')).toBeInTheDocument();
  expect(screen.getByText('Alice Alder')).toBeInTheDocument();
});

// 3. Clicking a result adds it as a chip
test('clicking a result adds it as a chip and calls onChange', async () => {
  mockApiFetch.mockResolvedValue(makeSearchResponse(MEMBERS));
  const onChange = jest.fn();
  render(<InviteePicker value={[]} onChange={onChange} />);

  const input = screen.getByRole('textbox', { name: /search members/i });
  fireEvent.change(input, { target: { value: 'bo' } });
  act(() => { jest.advanceTimersByTime(260); });

  await waitFor(() => screen.getByText('Bob Birch'));
  fireEvent.click(screen.getByText('Bob Birch'));

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ userId: 'u2', name: 'Bob Birch' }),
  ]);
});

// 4. Adding duplicate userId no-ops
test('adding a duplicate userId does not call onChange again', async () => {
  const existing: Invitee[] = [{ userId: 'u1', name: 'Alice Alder' }];
  mockApiFetch.mockResolvedValue(makeSearchResponse(MEMBERS));
  const onChange = jest.fn();
  render(<InviteePicker value={existing} onChange={onChange} />);

  const input = screen.getByRole('textbox', { name: /search members/i });
  fireEvent.change(input, { target: { value: 'al' } });
  act(() => { jest.advanceTimersByTime(260); });

  // u1 (Alice) should be filtered from results because she's already selected
  const listbox = await waitFor(() => screen.getByRole('listbox'));
  // Alice should NOT appear in results (already selected → filtered out)
  expect(listbox.textContent).not.toContain('Alice Alder');
  // Bob and Carol should appear in the dropdown
  expect(screen.getByText('Bob Birch')).toBeInTheDocument();
  // onChange should not have been called yet
  expect(onChange).not.toHaveBeenCalled();
});

// 5. Cap=10 with 10 selected → add buttons disabled
test('when cap reached, add buttons are disabled and cap hint shown', async () => {
  const tenInvitees: Invitee[] = Array.from({ length: 10 }, (_, i) => ({
    userId: `u${i + 100}`,
    name: `User ${i + 100}`,
  }));
  mockApiFetch.mockResolvedValue(makeSearchResponse(MEMBERS));
  renderPicker({ value: tenInvitees, cap: 10 });

  const input = screen.getByRole('textbox', { name: /search members/i });
  fireEvent.change(input, { target: { value: 'al' } });
  act(() => { jest.advanceTimersByTime(260); });

  await waitFor(() => screen.getByRole('listbox'));
  expect(screen.getByText(/10\/10 reached/i)).toBeInTheDocument();
  const addButtons = screen.getAllByRole('option');
  addButtons.forEach((opt) => {
    const btn = opt.querySelector('button');
    if (btn) expect(btn).toBeDisabled();
  });
});

// 6. Removing a chip calls onChange with shorter array
test('removing a chip calls onChange with that invitee removed', () => {
  const selected: Invitee[] = [
    { userId: 'u1', name: 'Alice Alder' },
    { userId: 'u2', name: 'Bob Birch' },
  ];
  const onChange = jest.fn();
  render(<InviteePicker value={selected} onChange={onChange} />);

  // Click remove button for Alice
  const removeAlice = screen.getByRole('button', { name: /remove alice alder/i });
  fireEvent.click(removeAlice);

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ userId: 'u2', name: 'Bob Birch' }),
  ]);
});
