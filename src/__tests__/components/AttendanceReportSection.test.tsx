import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AttendanceReportSection } from '@/components/attendance-reports/AttendanceReportSection';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

import { useSession } from 'next-auth/react';
const mockUseSession = useSession as unknown as jest.Mock;

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  mockUseSession.mockReset();
});

const yesterday = new Date(Date.now() - 86_400_000).toISOString();
const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

function mockGetReturns(report: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ report }),
  } as Response);
}

describe('<AttendanceReportSection>', () => {
  it('renders nothing when the event has not yet ended (R2)', () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    const { container } = render(
      <AttendanceReportSection eventId={5} endsAt={tomorrow} startsAt={tomorrow} />,
    );
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders nothing when not authenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    const { container } = render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the form when authenticated AND event has ended (R1)', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns(null);
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/did this event happen\?/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/was the host actually there\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('treats null endsAt as ended when starts_at + 1h is in the past', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns(null);
    // started 2h ago, no endsAt → eventEndedAt = startsAt + 1h = 1h ago → ended
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    render(
      <AttendanceReportSection eventId={5} endsAt={null} startsAt={twoHoursAgo} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/did this event happen\?/i)).toBeInTheDocument();
    });
  });

  it('GETs the existing report on mount', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns(null);
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/events/5/attendance-report',
        expect.any(Object),
      );
    });
  });

  it('prefills form with current report on revisit (R3)', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns({
      id: 7,
      eventId: 5,
      reporterId: 'h-1',
      eventHappened: false,
      hostPresent: false,
      note: 'never showed up',
    });
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    await waitFor(() => {
      const happenedNo = screen.getByLabelText(/^no$/i, { selector: 'input[name="eventHappened"][value="no"]' }) as HTMLInputElement;
      expect(happenedNo.checked).toBe(true);
    });
    const noteField = screen.getByDisplayValue('never showed up');
    expect(noteField).toBeInTheDocument();
  });

  it('POSTs the answers and shows confirmation (R4)', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns(null);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, action: 'inserted', reportId: 7 }),
    } as Response);
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    await waitFor(() => screen.getByRole('button', { name: /submit/i }));

    fireEvent.click(
      screen.getByLabelText(/^yes$/i, {
        selector: 'input[name="eventHappened"][value="yes"]',
      }),
    );
    fireEvent.click(
      screen.getByLabelText(/^no$/i, {
        selector: 'input[name="hostPresent"][value="no"]',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(postCall?.[0]).toBe('/api/events/5/attendance-report');
      const sent = JSON.parse(String((postCall?.[1] as RequestInit).body));
      expect(sent.eventHappened).toBe(true);
      expect(sent.hostPresent).toBe(false);
    });

    await waitFor(() => {
      expect(screen.getByText(/thanks for reporting/i)).toBeInTheDocument();
    });
  });

  it('shows a Loading… placeholder while the GET is in flight (R3 flicker fix)', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ report: null }) });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument(),
    );
  });

  it('disables Submit until both questions are answered', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: 'A' } },
      status: 'authenticated',
    });
    mockGetReturns(null);
    render(
      <AttendanceReportSection eventId={5} endsAt={yesterday} startsAt={yesterday} />,
    );
    const button = await screen.findByRole('button', { name: /submit/i });
    expect(button).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(/^yes$/i, {
        selector: 'input[name="eventHappened"][value="yes"]',
      }),
    );
    expect(button).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(/^yes$/i, {
        selector: 'input[name="hostPresent"][value="yes"]',
      }),
    );
    expect(button).not.toBeDisabled();
  });
});
