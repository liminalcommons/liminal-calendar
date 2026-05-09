/**
 * Integration tests: EventForm visibility-toggle gating
 *
 * Member → sees static "Private (members can only create private events)" caption, no <select>.
 * Host   → sees a <select> with "Private" + "Public" options.
 */
import { render, screen } from '@testing-library/react';
import { EventForm } from '@/components/events/EventForm';

// ── heavy mocks ────────────────────────────────────────────────────────────

// Mock DB-dependent modules to avoid neon/TextDecoder bootstrap errors in jsdom
jest.mock('@/lib/db', () => ({ db: {} }));
jest.mock('@/lib/events/invitations-repo', () => ({
  INVITEE_CAP_MEMBER: 10,
  validateInviteeCap: jest.fn(),
  setEventInvitations: jest.fn(),
  listEventInvitations: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn().mockResolvedValue({ ok: true, json: async () => ({ zones: [] }) }),
  SESSION_EXPIRED_EVENT: 'calendar:session-expired',
}));

jest.mock('@/lib/timezone-utils', () => ({
  getUserTimezone: () => 'UTC',
  formatTimeInTimezone: () => '6:00 PM',
  isLateNightInAnyTimezone: () => false,
  COMMUNITY_TIMEZONES: [],
}));

jest.mock('@/components/ImageUpload', () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}));

jest.mock('@/components/events/RecurrenceSelector', () => ({
  RecurrenceSelector: () => <div data-testid="recurrence-selector" />,
}));

jest.mock('@/components/availability/AvailabilityTimeline', () => ({
  AvailabilityTimeline: () => null,
}));

import { useSession } from 'next-auth/react';
const mockUseSession = useSession as jest.Mock;

// ── tests ─────────────────────────────────────────────────────────────────

function renderForm(role: string) {
  mockUseSession.mockReturnValue({
    data: { user: { name: 'Test', role } },
    status: 'authenticated',
  });
  return render(<EventForm mode="create" />);
}

test('member sees static private caption, no visibility select', () => {
  renderForm('member');
  expect(screen.queryByRole('combobox', { name: /visibility/i })).not.toBeInTheDocument();
  // Could be a label + static text
  expect(
    screen.getByText(/Private \(members can only create private events\)/i),
  ).toBeInTheDocument();
});

test('host sees visibility select with private and public options', () => {
  renderForm('host');
  // The label "Visibility" is in a <label> element; find the select by its position
  const selects = screen.getAllByRole('combobox');
  // At least one select should exist for visibility
  // Find the one containing Private/Public
  const visibilitySelect = selects.find((el) => {
    const opts = Array.from(el.querySelectorAll('option')).map((o) => o.textContent);
    return opts.includes('Private') && opts.includes('Public');
  });
  expect(visibilitySelect).toBeDefined();
});

test('admin sees visibility select with private and public options', () => {
  renderForm('admin');
  const selects = screen.getAllByRole('combobox');
  const visibilitySelect = selects.find((el) => {
    const opts = Array.from(el.querySelectorAll('option')).map((o) => o.textContent);
    return opts.includes('Private') && opts.includes('Public');
  });
  expect(visibilitySelect).toBeDefined();
});
