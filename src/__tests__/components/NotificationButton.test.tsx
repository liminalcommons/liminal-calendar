import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { NotificationButton } from '@/components/NotificationButton';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, onClick, className }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}));

import { useSession } from 'next-auth/react';
const mockUseSession = useSession as unknown as jest.Mock;

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockUseSession.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

function mockListReturns(notifications: unknown[], unseenCount: number) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ notifications, unseenCount }),
  } as Response);
}

function mockSeenOk() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ marked: 1 }),
  } as Response);
}

describe('<NotificationButton>', () => {
  it('renders nothing when unauthenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    const { container } = render(<NotificationButton />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the bell + Inbox label when authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 0);
    render(<NotificationButton />);
    expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('shows a badge with the unseenCount', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 4);
    render(<NotificationButton />);
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    expect(screen.getByLabelText(/4 unread/i)).toBeInTheDocument();
  });

  it('clamps badge to 9+ for >9 unseen', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 42);
    render(<NotificationButton />);
    await waitFor(() => expect(screen.getByText('9+')).toBeInTheDocument());
  });

  it('renders empty state when no notifications, after click', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 0);
    render(<NotificationButton />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const button = screen.getByLabelText(/notifications/i);
    fireEvent.click(button);
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('lists notifications with title, body, relative time', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns(
      [
        {
          id: 1,
          type: 'reminder.1hr',
          eventId: 5,
          actorName: null,
          title: 'Coffee House — in 1 hour',
          body: 'Starts in about 1 hour',
          url: '/events/5',
          createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          seenAt: null,
        },
      ],
      1,
    );
    mockSeenOk();
    render(<NotificationButton />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/notifications/i));
    expect(screen.getByText('Coffee House — in 1 hour')).toBeInTheDocument();
    expect(screen.getByText('Starts in about 1 hour')).toBeInTheDocument();
    expect(screen.getByText(/m ago/)).toBeInTheDocument();
  });

  it('marks seen on open: POST /api/notifications/seen + clears badge', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 3);
    mockSeenOk();
    render(<NotificationButton />);
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/notifications/i));

    await waitFor(() => {
      const seenCall = fetchMock.mock.calls.find(([url, opts]) =>
        typeof url === 'string' && url.includes('/api/notifications/seen') &&
        (opts as { method?: string })?.method === 'POST',
      );
      expect(seenCall).toBeTruthy();
    });
    // Badge optimistically cleared.
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('does NOT POST seen when there are zero unseen', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockListReturns([], 0);
    render(<NotificationButton />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/notifications/i));
    // Allow microtasks to settle.
    await act(async () => { await Promise.resolve(); });

    const seenCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/notifications/seen'),
    );
    expect(seenCalls).toHaveLength(0);
  });
});
