import { render, screen, fireEvent } from '@testing-library/react';
import {
  AttendanceReportsTable,
  type AggregatedEvent,
} from '@/components/admin/AttendanceReportsTable';

const sample: AggregatedEvent[] = [
  {
    eventId: 5,
    eventTitle: 'Stewards Circle',
    eventStartsAt: '2026-04-04T18:00:00Z',
    totalReports: 3,
    happenedYes: 2,
    hostPresentYes: 2,
    reports: [
      {
        id: 1, reporterId: 'u-1', reporterName: 'Alice',
        eventHappened: true, hostPresent: true, note: null,
        createdAt: '2026-04-05T01:00:00Z',
      },
      {
        id: 2, reporterId: 'u-2', reporterName: 'Bob',
        eventHappened: true, hostPresent: true, note: 'great session',
        createdAt: '2026-04-05T02:00:00Z',
      },
      {
        id: 3, reporterId: 'u-3', reporterName: 'Cara',
        eventHappened: false, hostPresent: false, note: 'never started',
        createdAt: '2026-04-05T03:00:00Z',
      },
    ],
  },
];

describe('<AttendanceReportsTable>', () => {
  it('renders an empty-state message when there are no events', () => {
    render(<AttendanceReportsTable events={[]} />);
    expect(screen.getByText(/no attendance reports yet/i)).toBeInTheDocument();
  });

  it('renders one row per event with title and counts', () => {
    render(<AttendanceReportsTable events={sample} />);
    expect(screen.getByText('Stewards Circle')).toBeInTheDocument();
    // "Happened: 2/3" and "Host present: 2/3" or similar
    expect(screen.getAllByText(/2\s*\/\s*3/).length).toBeGreaterThanOrEqual(2);
  });

  it('hides per-report detail until the row is expanded', () => {
    render(<AttendanceReportsTable events={sample} />);
    expect(screen.queryByText('great session')).not.toBeInTheDocument();
    expect(screen.queryByText('never started')).not.toBeInTheDocument();
  });

  it('expands per-event detail when the row is clicked', () => {
    render(<AttendanceReportsTable events={sample} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Stewards Circle/i }),
    );
    expect(screen.getByText('great session')).toBeInTheDocument();
    expect(screen.getByText('never started')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Cara')).toBeInTheDocument();
  });

  it('collapses an expanded row when clicked again', () => {
    render(<AttendanceReportsTable events={sample} />);
    const button = screen.getByRole('button', { name: /Stewards Circle/i });
    fireEvent.click(button);
    expect(screen.getByText('great session')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByText('great session')).not.toBeInTheDocument();
  });

  it('event title links to the event detail page', () => {
    render(<AttendanceReportsTable events={sample} />);
    const link = screen.getByRole('link', { name: /open event/i });
    expect(link).toHaveAttribute('href', '/events/5');
  });

  it('renders fraction text Happened and Host present', () => {
    render(<AttendanceReportsTable events={sample} />);
    expect(screen.getByText(/happened/i)).toBeInTheDocument();
    expect(screen.getByText(/host present/i)).toBeInTheDocument();
  });
});
