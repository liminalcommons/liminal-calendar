import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { LinkClerkButton } from '@/components/profile/LinkClerkButton';

jest.mock('@/lib/api-fetch', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-fetch';

const mockApiFetch = apiFetch as jest.Mock;

function makeResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('LinkClerkButton', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('renders the link button in idle state', () => {
    render(<LinkClerkButton />);
    expect(
      screen.getByRole('button', { name: /Link Hylo \+ Clerk accounts/i }),
    ).toBeInTheDocument();
  });

  it('shows ok message on already_linked response', async () => {
    mockApiFetch.mockResolvedValue(makeResponse(200, { status: 'already_linked', memberId: 5 }));
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/already linked/i)).toBeInTheDocument();
    });
  });

  it('shows ok message on clerk_attached response', async () => {
    mockApiFetch.mockResolvedValue(makeResponse(200, { status: 'clerk_attached', memberId: 7 }));
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/Linked your Clerk identity/i)).toBeInTheDocument();
    });
  });

  it('shows needs_both_sessions instruction on 401', async () => {
    mockApiFetch.mockResolvedValue(makeResponse(401, { error: 'Both Hylo and Clerk sessions are required to link accounts.' }));
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/signed in via BOTH Hylo and Clerk/i)).toBeInTheDocument();
    });
  });

  it('shows needs_merge instruction on 409 with both ids', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse(409, { hyloMemberId: 10, clerkMemberId: 11 }),
    );
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/admin merge is required/i)).toBeInTheDocument();
      expect(screen.getByText(/#10 and #11/)).toBeInTheDocument();
    });
  });

  it('shows error message on unexpected status', async () => {
    mockApiFetch.mockResolvedValue(makeResponse(500, { error: 'sync may not have completed' }));
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/sync may not have completed/i)).toBeInTheDocument();
    });
  });

  it('shows error message on network failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    render(<LinkClerkButton />);
    screen.getByRole('button').click();
    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });
});
