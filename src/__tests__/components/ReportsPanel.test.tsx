import { render, screen, waitFor } from '@testing-library/react';
import { ReportsPanel } from '@/components/admin/ReportsPanel';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

describe('<ReportsPanel>', () => {
  it('shows a loading state on first render', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<ReportsPanel />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('fetches /api/admin/attendance-reports on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [] }),
    } as Response);
    render(<ReportsPanel />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/attendance-reports',
        expect.any(Object),
      );
    });
  });

  it('renders the AttendanceReportsTable with fetched events', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          {
            eventId: 5,
            eventTitle: 'Stewards Circle',
            eventStartsAt: '2026-04-04T18:00:00Z',
            totalReports: 1,
            happenedYes: 1,
            hostPresentYes: 1,
            reports: [
              {
                id: 1, reporterId: 'u-1', reporterName: 'Alice',
                eventHappened: true, hostPresent: true, note: null,
                createdAt: '2026-04-05T01:00:00Z',
              },
            ],
          },
        ],
      }),
    } as Response);
    render(<ReportsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Stewards Circle')).toBeInTheDocument();
    });
  });

  it('shows empty state when fetch returns no events', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [] }),
    } as Response);
    render(<ReportsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no attendance reports yet/i)).toBeInTheDocument();
    });
  });

  it('shows an error message when the fetch fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    } as Response);
    render(<ReportsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load reports/i)).toBeInTheDocument();
    });
  });
});
