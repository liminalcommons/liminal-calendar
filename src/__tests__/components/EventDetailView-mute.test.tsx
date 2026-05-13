import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EventDetailView } from '@/components/events/EventDetailView';

// ── next/navigation ──────────────────────────────────────────────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ── next/link — render as plain <a> ─────────────────────────────────────────
jest.mock('next/link', () => {
  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

// ── next-auth/react ───────────────────────────────────────────────────────────
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));
import { useSession } from 'next-auth/react';
const mockUseSession = useSession as unknown as jest.Mock;

// ── use-resolved-role ─────────────────────────────────────────────────────────
jest.mock('@/lib/use-resolved-role', () => ({
  useResolvedProfile: jest.fn(() => ({
    profile: null,
    resolved: true,
  })),
}));

// ── child components — stub to avoid their own fetch side-effects ─────────────
jest.mock('@/components/events/EventRSVP', () => ({
  EventRSVP: () => <div data-testid="rsvp-stub" />,
}));
jest.mock('@/components/comments/CommentSection', () => ({
  CommentSection: () => <div data-testid="comments-stub" />,
}));
jest.mock('@/components/attendance-reports/AttendanceReportSection', () => ({
  AttendanceReportSection: () => <div data-testid="attendance-stub" />,
}));

// ── global.fetch ──────────────────────────────────────────────────────────────
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const FAKE_EVENT = {
  id: 42,
  title: 'Test Event',
  creator_id: 'u1',
  creator_name: 'Alice',
  creator_image: null,
  starts_at: new Date(Date.now() + 3_600_000).toISOString(),
  ends_at: null,
  description: 'desc',
  event_url: null,
  imageUrl: null,
  recurrenceRule: null,
  myResponse: null,
};

function mockEventFetch() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => FAKE_EVENT,
  } as Response);
}

function mockPrefsMuted(eventIds: number[] = []) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ muted: eventIds.map((id) => ({ eventId: id })) }),
  } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  mockUseSession.mockReturnValue({
    data: { user: { id: 'u1', name: 'Alice' } },
    status: 'authenticated',
  });
});

describe('<EventDetailView> — mute toggle', () => {
  it('renders "Mute notifications" button when initially not muted', async () => {
    mockEventFetch();
    mockPrefsMuted([]); // event 42 not in muted list

    render(<EventDetailView eventId="42" />);

    const btn = await screen.findByRole('button', {
      name: /mute notifications for this series/i,
    });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/mute notifications/i);
  });

  it('click Mute → POSTs to /api/events/42/mute → UI flips to Unmute', async () => {
    mockEventFetch();
    mockPrefsMuted([]); // not muted initially

    // POST response returns muted: true
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ muted: true, eventId: 42 }),
    } as Response);

    render(<EventDetailView eventId="42" />);

    const btn = await screen.findByRole('button', {
      name: /mute notifications for this series/i,
    });
    fireEvent.click(btn);

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/events/42/mute');
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /unmute notifications for this series/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows "Unmute" button when prefs reports the event as already muted', async () => {
    mockEventFetch();
    mockPrefsMuted([42]); // event 42 IS muted

    render(<EventDetailView eventId="42" />);

    const btn = await screen.findByRole('button', {
      name: /unmute notifications for this series/i,
    });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/unmute/i);
  });
});
