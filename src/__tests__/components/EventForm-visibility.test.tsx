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

// EventForm calls useUser() from @clerk/nextjs, which throws "useUser can only be
// used within <ClerkProvider>" when rendered bare. Stub it as an unauthenticated
// Clerk user.
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isSignedIn: false, isLoaded: true, user: null }),
}));

// useResolvedRole fetches /api/profile and caches the result at module scope, so
// the first test's role would leak into later tests (host/admin would all read
// the cached 'member'). Drive it from the same NextAuth session the test controls
// so each role renders independently while EventForm's real canCreatePublic gating
// (role === 'host' || 'admin') stays under test.
jest.mock('@/lib/use-resolved-role', () => ({
  useResolvedRole: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSession } = require('next-auth/react');
    return { role: useSession().data?.user?.role ?? null, resolved: true };
  },
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
