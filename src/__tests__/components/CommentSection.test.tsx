import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { CommentSection } from '@/components/comments/CommentSection';

jest.mock('next-auth/react', () => {
  return {
    useSession: jest.fn(),
  };
});

import { useSession } from 'next-auth/react';
const mockUseSession = useSession as unknown as jest.Mock;

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function mockGetReturns(comments: unknown[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ comments }),
  } as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  mockUseSession.mockReset();
});

describe('<CommentSection>', () => {
  it('fetches /api/events/<id>/comments on mount', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockGetReturns([]);
    render(<CommentSection eventId={42} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/events/42/comments',
        expect.any(Object),
      );
    });
  });

  it('renders the CommentList with fetched rows', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockGetReturns([
      {
        id: 1,
        authorId: 'u-1',
        authorName: 'Alice',
        authorImage: null,
        body: 'hello there',
        createdAt: '2026-05-02T10:00:00Z',
      },
    ]);
    render(<CommentSection eventId={42} />);
    await waitFor(() => {
      expect(screen.getByText('hello there')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('renders a "sign in to comment" CTA when unauthenticated', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockGetReturns([]);
    render(<CommentSection eventId={42} />);
    await waitFor(() => {
      expect(screen.getByText(/sign in to comment/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders a textarea + Post button when authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'Alice' } },
      status: 'authenticated',
    });
    mockGetReturns([]);
    render(<CommentSection eventId={42} />);
    await waitFor(() => screen.getByRole('textbox'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post/i })).toBeInTheDocument();
  });

  it('POSTs the comment and prepends it to the list on submit', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'Alice', hyloId: 'h-1' } },
      status: 'authenticated',
    });
    mockGetReturns([]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        comment: {
          id: 99,
          authorId: 'h-1',
          authorName: 'Alice',
          authorImage: null,
          body: 'first!',
          createdAt: '2026-05-02T11:00:00Z',
        },
      }),
    } as Response);

    render(<CommentSection eventId={42} />);
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'first!' } });
    fireEvent.click(screen.getByRole('button', { name: /post/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/events/42/comments');
      const sentBody = JSON.parse(String((postCall?.[1] as RequestInit).body));
      expect(sentBody.body).toBe('first!');
    });

    await waitFor(() => {
      expect(screen.getByText('first!')).toBeInTheDocument();
    });
  });

  it('disables the Post button when textarea is empty', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'Alice' } },
      status: 'authenticated',
    });
    mockGetReturns([]);
    render(<CommentSection eventId={42} />);
    const button = await screen.findByRole('button', { name: /post/i });
    expect(button).toBeDisabled();
  });

  it('shows a loading state before the fetch resolves', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<CommentSection eventId={42} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ comments: [] }) });
    });
  });
});
